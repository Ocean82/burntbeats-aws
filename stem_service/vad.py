"""
Silero VAD for pre-splitting: detect vocal/speech regions to trim input and speed up separation.
Uses models/silero_vad.jit (torch.jit.load). VAD runs at 16 kHz; timestamps map to original SR.
Requires silero-vad package for get_speech_timestamps; optional so app runs without it.

Segment handling:
- Pad segments ±200–400 ms to avoid hard cuts and zipper artifacts on sustained singing.
- Merge segments with gaps ≤300 ms so brief silences don't create clicks.
"""

from __future__ import annotations

from pathlib import Path

import soundfile as sf
import torch
import torchaudio

from stem_service.config import SILERO_VAD_JIT

VAD_SAMPLE_RATE = 16000

# Padding: 200–400 ms prevents clicks at segment boundaries (sustained harmonics)
VAD_PAD_SEC = 0.3  # 300 ms each side
# Merge segments when gap between them is ≤300 ms (avoids zipper artifacts)
VAD_MAX_GAP_TO_MERGE_SEC = 0.3

try:
    from silero_vad import get_speech_timestamps as _silero_get_speech_timestamps  # type: ignore[import-untyped]
except ImportError:
    _silero_get_speech_timestamps = None


def _load_vad_model() -> torch.jit.ScriptModule | None:
    if not SILERO_VAD_JIT.exists():
        return None
    if _silero_get_speech_timestamps is None:
        return None
    try:
        model = torch.jit.load(str(SILERO_VAD_JIT), map_location="cpu")
        model.eval()
        return model
    except Exception:
        return None


def get_speech_timestamps(
    audio_path: Path,
    model: torch.jit.ScriptModule | None = None,
    threshold: float = 0.5,
    min_speech_duration_ms: int = 250,
    min_silence_duration_ms: int = 100,
    return_seconds: bool = True,
) -> list[dict[str, float]] | None:
    """
    Return list of speech segments: [{"start": s, "end": e}, ...] in seconds (or samples if not return_seconds).
    Returns None if VAD model unavailable or silero-vad not installed.
    """
    vad = model if model is not None else _load_vad_model()
    if vad is None or _silero_get_speech_timestamps is None:
        return None

    wav, sr = torchaudio.load(str(audio_path))
    if wav.shape[0] > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != VAD_SAMPLE_RATE:
        wav = torchaudio.functional.resample(wav, sr, VAD_SAMPLE_RATE)
    wav = wav.squeeze(0)

    # silero_vad.get_speech_timestamps(wav, model, sampling_rate=..., return_seconds=...)
    segments = _silero_get_speech_timestamps(
        wav,
        vad,
        sampling_rate=VAD_SAMPLE_RATE,
        threshold=threshold,
        min_speech_duration_ms=min_speech_duration_ms,
        min_silence_duration_ms=min_silence_duration_ms,
        return_seconds=return_seconds,
    )
    if not segments:
        return None
    if return_seconds:
        return [{"start": float(s["start"]), "end": float(s["end"])} for s in segments]
    return segments


def merge_speech_segments(
    segments: list[dict[str, float]],
    max_gap_sec: float = VAD_MAX_GAP_TO_MERGE_SEC,
) -> list[dict[str, float]]:
    """
    Merge segments that are within max_gap_sec of each other.
    Prevents zipper artifacts from hard cuts in brief silences (e.g. between sung phrases).
    """
    if not segments:
        return []
    sorted_segments = sorted(segments, key=lambda s: s["start"])
    merged: list[dict[str, float]] = [dict(sorted_segments[0])]
    for s in sorted_segments[1:]:
        if s["start"] - merged[-1]["end"] <= max_gap_sec:
            merged[-1]["end"] = max(merged[-1]["end"], s["end"])
        else:
            merged.append(dict(s))
    return merged


def get_speech_span_seconds(
    audio_path: Path,
    max_gap_to_merge_sec: float = VAD_MAX_GAP_TO_MERGE_SEC,
) -> tuple[float, float] | None:
    """
    Return (start_sec, end_sec) of the span from first speech to last speech.
    Merges segments with gaps ≤ max_gap_to_merge_sec before taking the span.
    Returns None if no speech or no VAD.
    """
    segments = get_speech_timestamps(audio_path, return_seconds=True)
    if not segments:
        return None
    merged = merge_speech_segments(segments, max_gap_sec=max_gap_to_merge_sec)
    if not merged:
        return None
    start = min(s["start"] for s in merged)
    end = max(s["end"] for s in merged)
    return (start, end)


def trim_audio_to_speech_span(
    input_path: Path,
    output_path: Path,
    padding_sec: float = VAD_PAD_SEC,
) -> Path | None:
    """
    Write a new WAV containing only the span from first to last speech, with padding.
    Segments are merged (gaps ≤300 ms) then padded ±padding_sec (200–400 ms) to avoid clicks.
    Returns output_path if trim was done, None if VAD unavailable or no speech.
    """
    span = get_speech_span_seconds(input_path)
    if span is None:
        return None
    start_sec, end_sec = span
    start_sec = max(0.0, start_sec - padding_sec)
    end_sec = end_sec + padding_sec
    wav, sr = torchaudio.load(str(input_path))
    start_sample = int(start_sec * sr)
    end_sample = min(int(end_sec * sr), wav.shape[-1])
    if start_sample >= end_sample:
        return None
    trimmed = wav[..., start_sample:end_sample]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), trimmed.T.numpy(), int(sr))
    return output_path


def is_vad_available() -> bool:
    return _load_vad_model() is not None
