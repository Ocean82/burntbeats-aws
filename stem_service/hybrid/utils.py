"""
Shared utilities for the hybrid pipeline.

Contains helpers used by multiple pipeline strategies:
- _materialize_stage1_instrumental: copy or phase-invert based on InstrumentalSource
- collapse_4stem_to_2stem: sum non-vocal stems into instrumental
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

import numpy as np
import soundfile as sf

from stem_service.phase_inversion import create_perfect_instrumental
from stem_service.vocal_stage1 import InstrumentalSource

logger = logging.getLogger(__name__)


def _materialize_stage1_instrumental(
    mix_path: Path,
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
        create_perfect_instrumental(mix_path, vocals_path, dest_instrumental)
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
