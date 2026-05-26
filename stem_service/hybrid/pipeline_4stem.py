"""
4-stem hybrid separation pipeline.

Entry point: run_4stem_single_pass_or_hybrid (compat alias onto the canonical hybrid path).
Core: run_hybrid_4stem (Stage 1 vocals → phase inversion → Stage 2 Demucs on instrumental).
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Callable

from stem_service.split import run_demucs
from stem_service.vocal_stage1 import extract_vocals_stage1

from stem_service.hybrid.utils import (
    _effective_input_path,
    _materialize_stage1_instrumental,
)

logger = logging.getLogger(__name__)


def run_4stem_single_pass_or_hybrid(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
    model_tier: str = "balanced",
) -> tuple[list[tuple[str, Path]], list[str]]:
    """Compatibility wrapper onto the canonical 4-stem hybrid path."""
    _log = job_logger or logger
    _log.info("4-stem: using canonical hybrid pipeline")
    return run_hybrid_4stem(
        input_path,
        output_dir,
        prefer_speed=prefer_speed,
        model_tier=model_tier,
        progress_callback=progress_callback,
        job_logger=_log,
    )


def run_hybrid_4stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    model_tier: str = "balanced",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
    vocal_model_override: Path | None = None,
    inst_model_override: Path | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    Stage 1: Extract vocals via 2-stem waterfall (MDX ranks 1–3, then Demucs htdemucs 2-stem).
    Phase inversion: instrumental = original - vocals (skip if Demucs gives instrumental).
    Stage 2: Demucs 4-stem on instrumental → drums, bass, other.
    prefer_speed=True: faster Stage 1 overlap (50%).
    prefer_speed=False: full-length input; higher Stage 1 overlap (75%).
    progress_callback: optional callable(percent) called at stage boundaries.
    Returns [(stem_id, path), ...] in order: vocals, drums, bass, other.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    effective_input = _effective_input_path(input_path, output_dir)

    stage1_out = output_dir / "stage1"
    stage1_end = 80 if prefer_speed else 88
    instrumental_end = 86 if prefer_speed else 92
    if progress_callback:
        progress_callback(5)
    vocals_path, stage1_instrumental, stage1_models, inst_src = extract_vocals_stage1(
        effective_input,
        stage1_out,
        prefer_speed=prefer_speed,
        model_tier=model_tier,
        job_logger=job_logger,
        vocal_model_override=vocal_model_override,
        inst_model_override=inst_model_override,
        progress_callback=progress_callback,
        progress_range=(5, stage1_end),
    )
    if progress_callback:
        progress_callback(stage1_end)

    instrumental_path = output_dir / "instrumental.wav"
    _materialize_stage1_instrumental(
        effective_input,
        vocals_path,
        stage1_instrumental,
        inst_src,
        instrumental_path,
    )

    if progress_callback:
        progress_callback(instrumental_end)

    stage2_out = output_dir / "stage2"
    stem_files = run_demucs(
        instrumental_path, stage2_out, stems=4, prefer_speed=prefer_speed
    )
    if progress_callback:
        progress_callback(97)

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    result: list[tuple[str, Path]] = []

    dest_vocals = flat_dir / "vocals.wav"
    shutil.copy2(vocals_path, dest_vocals)
    result.append(("vocals", dest_vocals))

    for stem_id, src in stem_files:
        if stem_id == "vocals":
            continue
        dest = flat_dir / f"{stem_id}.wav"
        shutil.copy2(src, dest)
        result.append((stem_id, dest))

    if progress_callback:
        progress_callback(100)
    models_used = stage1_models + ["htdemucs"]
    return result, models_used
