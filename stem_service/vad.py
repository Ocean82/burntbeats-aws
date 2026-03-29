"""
Silero VAD for pre-splitting: detect vocal/speech regions to trim input and speed up separation.
Uses models/silero_vad.onnx (ONNX runtime) — no PyTorch or silero-vad pip package required.
VAD runs at 16 kHz; timestamps map back to original SR via soundfile.
"""

from __future__ import annotations

from pathlib import Path

import av
import numpy as np
import soundfile as sf

from stem_service.config import SILERO_VAD_ONNX
from stem_service.silero_onnx_vad import (
    SileroOnnxVAD,
    get_speech_timestamps_onnx,
)

VAD_SAMPLE_RATE = 16000
VAD_PAD_SEC = 0.3
VAD_MAX_GAP_TO_MERGE_SEC = 0.3

_vad_instance: SileroOnnxVAD | None = None


def _get_vad() -> SileroOnnxVAD | None:
    global _vad_instance
    if _vad_instance is not None:
        return _vad_instance
    if not SILERO_VAD_ONNX.exists():
        return None
    try:
        _vad_instance = SileroOnnxVAD.from_default(model_path=SILERO_VAD_ONNX)
        return _vad_instance
    except Exception:
        return None


def _load_mono_16k(audio_path: Path) -> np.ndarray:
    """Decode audio to mono float32 at 16 kHz using PyAV (no torch dependency)."""
    with av.open(str(audio_path)) as container:
        audio_stream = next((s for s in container.streams if s.type == "audio"), None)
        if audio_stream is None:
            raise ValueError(f"No audio stream in {audio_path}")
        resampler = av.AudioResampler(format="s16", layout="mono", rate=VAD_SAMPLE_RATE)
        chunks: list[np.ndarray] = []
        for frame in container.decode(audio_stream):
            for out_frame in resampler.resample(frame):
                pcm = out_frame.to_ndarray()
                if pcm.ndim == 2:
                    pcm = pcm[0]
                chunks.append(pcm.astype(np.float32) / 32768.0)
        for out_frame in resampler.resample(None):
            pcm = out_frame.to_ndarray()
            if pcm.ndim == 2:
                pcm = pcm[0]
            chunks.append(pcm.astype(np.float32) / 32768.0)
    return np.concatenate(chunks) if chunks else np.empty(0, dtype=np.float32)


def get_speech_timestamps(
    audio_path: Path,
    threshold: float = 0.5,
    min_speech_duration_ms: int = 250,
    min_silence_duration_ms: int = 100,
    return_seconds: bool = True,
) -> list[dict[str, float]] | None:
    """
    Return list of speech segments: [{"start": s, "end": e}, ...] in seconds (or samples).
    Returns None if VAD model unavailable.
    """
    vad = _get_vad()
    if vad is None:
        return None

    wav = _load_mono_16k(audio_path)
    if wav.size == 0:
        return None

    segments = get_speech_timestamps_onnx(
        wav=wav,
        session=vad.session,
        sampling_rate=VAD_SAMPLE_RATE,
        threshold=threshold,
        min_speech_ms=min_speech_duration_ms,
        min_silence_ms=min_silence_duration_ms,
        speech_pad_ms=vad.speech_pad_ms,
    )

    if not segments:
        return None

    if return_seconds:
        return [
            {"start": s["start"] / VAD_SAMPLE_RATE, "end": s["end"] / VAD_SAMPLE_RATE}
            for s in segments
        ]
    return [{"start": float(s["start"]), "end": float(s["end"])} for s in segments]


def merge_speech_segments(
    segments: list[dict[str, float]],
    max_gap_sec: float = VAD_MAX_GAP_TO_MERGE_SEC,
) -> list[dict[str, float]]:
    """Merge segments within max_gap_sec of each other."""
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
    """Return (start_sec, end_sec) of the span from first to last speech."""
    segments = get_speech_timestamps(audio_path, return_seconds=True)
    if not segments:
        return None
    merged = merge_speech_segments(segments, max_gap_sec=max_gap_to_merge_sec)
    if not merged:
        return None
    return (min(s["start"] for s in merged), max(s["end"] for s in merged))


def trim_audio_to_speech_span(
    input_path: Path,
    output_path: Path,
    padding_sec: float = VAD_PAD_SEC,
) -> Path | None:
    """Write a WAV containing only the first-to-last speech span with padding."""
    span = get_speech_span_seconds(input_path)
    if span is None:
        return None
    start_sec, end_sec = span
    start_sec = max(0.0, start_sec - padding_sec)
    end_sec = end_sec + padding_sec

    wav, sr = sf.read(str(input_path), always_2d=True)
    start_sample = int(start_sec * sr)
    end_sample = min(int(end_sec * sr), wav.shape[0])
    if start_sample >= end_sample:
        return None

    trimmed = wav[start_sample:end_sample]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), trimmed, sr)
    return output_path


def is_vad_available() -> bool:
    return _get_vad() is not None


def get_chunk_boundaries(
    audio_path: Path,
    chunk_length_s: float = 30.0,
    silence_flush_s: float = 5.0,
) -> list[tuple[float, float]] | None:
    """
    Compute chunk boundaries for chunked separation.
    Cuts at end-of-speech boundaries so each chunk is ~chunk_length_s and never mid-phrase.
    Returns [(start_s, end_s), ...] or None if VAD unavailable.
    """
    segments = get_speech_timestamps(audio_path, return_seconds=True)
    if segments is None:
        return None

    try:
        info = sf.info(str(audio_path))
        total_s = info.duration
    except Exception:
        return None

    if not segments:
        return [(0.0, total_s)]

    merged = merge_speech_segments(segments, max_gap_sec=VAD_MAX_GAP_TO_MERGE_SEC)

    chunks: list[tuple[float, float]] = []
    chunk_start = 0.0

    for i, seg in enumerate(merged):
        seg_end = seg["end"]
        chunk_len = seg_end - chunk_start
        gap = (merged[i + 1]["start"] - seg_end) if i + 1 < len(merged) else (total_s - seg_end)
        if chunk_len >= chunk_length_s or gap >= silence_flush_s:
            chunks.append((chunk_start, seg_end))
            chunk_start = seg_end

    if chunk_start < total_s:
        chunks.append((chunk_start, total_s))

    return chunks if chunks else [(0.0, total_s)]
