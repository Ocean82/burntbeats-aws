"""
Shared utilities for the hybrid pipeline.

Contains helpers used by multiple pipeline strategies:
- _materialize_stage1_instrumental: copy or phase-invert based on InstrumentalSource
- collapse_4stem_to_2stem: sum non-vocal stems into instrumental
- _effective_input_path: VAD pre-trim logic
- _slice_audio / _concat_stems: VAD chunking helpers
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

import numpy as np
import soundfile as sf

from stem_service.config import USE_VAD_PRETRIM
from stem_service.phase_inversion import create_perfect_instrumental
from stem_service.vad import is_vad_available, trim_audio_to_speech_span
from stem_service.vocal_stage1 import InstrumentalSource

logger = logging.getLogger(__name__)


def _materialize_stage1_instrumental(
    effective_input: Path,
    vocals_path: Path,
    stage1_instrumental: Path | None,
    inst_src: InstrumentalSource,
    dest_instrumental: Path,
) -> None:
    """
    Copy Stage-1 instrumental when already final, or run phase inversion when pending.
    Enforces invariants so ``None`` is never ambiguous.
    """
    if inst_src.needs_hybrid_phase_inversion():
        if stage1_instrumental is not None:
            raise ValueError(
                "Stage 1 invariant: PHASE_INVERSION_PENDING but instrumental path is set"
            )
        create_perfect_instrumental(effective_input, vocals_path, dest_instrumental)
        return
    if stage1_instrumental is None:
        raise ValueError(
            f"Stage 1 invariant: instrumental_source={inst_src.value!r} requires a path"
        )
    shutil.copy2(stage1_instrumental, dest_instrumental)


def collapse_4stem_to_2stem(
    four_stem_list: list[tuple[str, Path]], output_dir: Path
) -> list[tuple[str, Path]]:
    """
    Convert 4-stem separation (vocals, drums, bass, other) to 2-stem
    (vocals, instrumental) by summing non-vocal stems.

    Args:
        four_stem_list: List of (stem_id, Path) tuples from 4-stem separation
        output_dir: Directory to save the collapsed instrumental

    Returns:
        List of (stem_id, Path) tuples for 2-stem: [("vocals", path), ("instrumental", path)]
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Extract vocals and non-vocal stems
    vocals_path = None
    stem_arrays = []
    sample_rate = None

    for stem_id, stem_path in four_stem_list:
        if stem_id == "vocals":
            vocals_path = stem_path
        elif stem_id in ["drums", "bass", "other"]:
            audio, sr = sf.read(str(stem_path), dtype="float32", always_2d=True)
            if stem_arrays:
                if len(audio) != len(stem_arrays[0]) or sr != sample_rate:
                    raise ValueError(
                        f"Stem {stem_id} has mismatched dimensions or sample rate"
                    )
            stem_arrays.append(audio)
            sample_rate = sr

    if vocals_path is None:
        raise ValueError("Vocals stem not found in 4-stem output")

    if not stem_arrays:
        raise ValueError("No non-vocal stems found to create instrumental")

    # Sum all non-vocal stems to create instrumental
    instrumental_audio = np.sum(stem_arrays, axis=0)

    # Save instrumental
    instrumental_path = output_dir / "instrumental.wav"
    sf.write(str(instrumental_path), instrumental_audio, sample_rate)

    return [("vocals", vocals_path), ("instrumental", instrumental_path)]


def _effective_input_path(
    input_path: Path,
    output_dir: Path,
    use_vad_trim: bool | None = None,
) -> Path:
    """If VAD trim requested and VAD available, trim to speech span; else return input.
    use_vad_trim: True = trim when VAD available; False = never trim; None = follow USE_VAD_PRETRIM env.
    """
    if not USE_VAD_PRETRIM:
        return input_path
    if use_vad_trim is False:
        return input_path
    if not is_vad_available():
        return input_path
    trimmed = output_dir / "vad_trimmed.wav"
    if trim_audio_to_speech_span(input_path, trimmed) is not None:
        return trimmed
    return input_path


def _slice_audio(
    input_path: Path,
    start_s: float,
    end_s: float,
    out_path: Path,
) -> Path:
    """Write a slice of input_path [start_s, end_s) to out_path."""
    audio, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    start_i = int(start_s * sr)
    end_i = min(int(end_s * sr), len(audio))
    sf.write(str(out_path), audio[start_i:end_i], sr)
    return out_path


def _concat_stems(
    chunk_stem_lists: list[list[tuple[str, Path]]],
    output_dir: Path,
) -> list[tuple[str, Path]]:
    """Concatenate per-chunk stem WAVs into final stems."""
    if not chunk_stem_lists:
        return []
    stem_ids = [sid for sid, _ in chunk_stem_lists[0]]
    result: list[tuple[str, Path]] = []
    for stem_id in stem_ids:
        chunks_for_stem: list[np.ndarray] = []
        sr_out = 44100
        for chunk_stems in chunk_stem_lists:
            for sid, path in chunk_stems:
                if sid == stem_id:
                    audio, sr_out = sf.read(str(path), dtype="float32", always_2d=True)
                    chunks_for_stem.append(audio)
                    break
        if not chunks_for_stem:
            continue
        combined = np.concatenate(chunks_for_stem, axis=0)
        out_path = output_dir / f"{stem_id}.wav"
        sf.write(str(out_path), combined, sr_out)
        result.append((stem_id, out_path))
    return result
