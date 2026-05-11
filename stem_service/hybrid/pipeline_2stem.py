"""
2-stem separation pipelines: hybrid (ONNX waterfall) and demucs-only.

See docs/stem-pipeline.md for routing documentation.
See docs/MODEL-SELECTION-AUTHORITY.md for tier assignments.
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


def run_hybrid_2stem(
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
    2-stem separation: vocals + instrumental.

    Speed mode (prefer_speed=True):
      - VAD pre-trim to vocal span (same as 4-stem speed path)
      - 50% ONNX overlap (faster processing)
    Quality mode (prefer_speed=False):
      - Full file, no trim
      - 75% ONNX overlap (smoother chunk boundaries, less bleed)

    Stage 1 waterfall: rank1 UVR_MDXNET_3_9662 (or vocal_model_override) → rank2 KARA →
    rank3 MDX23C pair → rank4 PyTorch htdemucs 2-stem.

    Progress budget:
      0–5%   → job start / VAD trim
      5–90%  → Stage 1 ONNX vocal extraction (chunk-level granularity)
      90–95% → phase inversion / instrumental copy
      95–100% → copy to flat stems dir

    Returns [(stem_id, path), ...]: [("vocals", ...), ("instrumental", ...)].
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)

    # Speed mode: VAD pre-trim to vocal span (skip silence at start/end)
    # Quality mode: process full file for best boundary accuracy
    effective_input = _effective_input_path(input_path, output_dir)

    if progress_callback:
        progress_callback(5)

    # Stage 1: ranked ONNX then Demucs (see vocal_stage1.extract_vocals_stage1)
    stage1_out = output_dir / "stage1"
    vocals_path, stage1_instrumental, stage1_models, inst_src = extract_vocals_stage1(
        effective_input,
        stage1_out,
        prefer_speed=prefer_speed,
        model_tier=model_tier,
        job_logger=job_logger,
        vocal_model_override=vocal_model_override,
        inst_model_override=inst_model_override,
        progress_callback=progress_callback,
        progress_range=(5, 90),
    )

    if progress_callback:
        progress_callback(90)

    instrumental_path = output_dir / "instrumental.wav"
    _materialize_stage1_instrumental(
        effective_input,
        vocals_path,
        stage1_instrumental,
        inst_src,
        instrumental_path,
    )

    if progress_callback:
        progress_callback(95)

    dest_v = flat_dir / "vocals.wav"
    dest_i = flat_dir / "instrumental.wav"
    shutil.copy2(vocals_path, dest_v)
    shutil.copy2(instrumental_path, dest_i)
    if progress_callback:
        progress_callback(100)
    return [("vocals", dest_v), ("instrumental", dest_i)], stage1_models


def run_demucs_only_2stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    2-stem separation using PyTorch Demucs only (no MDX ONNX Stage 1 waterfall).
    Same flat layout as ``run_hybrid_2stem``: ``stems/vocals.wav`` and ``stems/instrumental.wav``.
    VAD pre-trim matches hybrid when ``prefer_speed`` and ``USE_VAD_PRETRIM`` apply.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    _log = job_logger or logger
    effective_input = _effective_input_path(input_path, output_dir)
    stage_out = output_dir / "stage1_demucs"
    _log.info(
        "2-stem demucs_only: PyTorch htdemucs --two-stems=vocals (prefer_speed=%s)",
        prefer_speed,
    )
    stem_files = run_demucs(
        effective_input, stage_out, stems=2, prefer_speed=prefer_speed
    )
    if progress_callback:
        progress_callback(50)
    dest_v = flat_dir / "vocals.wav"
    dest_i = flat_dir / "instrumental.wav"
    for stem_id, src in stem_files:
        if stem_id == "vocals":
            shutil.copy2(src, dest_v)
        elif stem_id == "instrumental":
            shutil.copy2(src, dest_i)
    if progress_callback:
        progress_callback(100)
    if not dest_v.is_file() or not dest_i.is_file():
        raise RuntimeError(
            "demucs_only 2-stem: missing vocals or instrumental after Demucs; "
            f"stem_files={stem_files!r}"
        )
    return [("vocals", dest_v), ("instrumental", dest_i)], ["htdemucs"]
