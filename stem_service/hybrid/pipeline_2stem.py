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

from stem_service.demucs_process import DemucsHealthMarker
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
    model_tier: str = "quality",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
    vocal_model_override: Path | None = None,
    inst_model_override: Path | None = None,
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[DemucsHealthMarker], None] | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    2-stem separation: vocals + instrumental via Stage 1 ONNX + phase inversion (or inst ONNX pass).

    Speed: 50% ONNX overlap. Quality: 75% overlap. VAD pre-trim is disabled (full file).

    Progress: 5–90% Stage 1 ONNX; 90–95% instrumental; 95–100% copy to stems/.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    del cancel_check, health_callback

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)

    effective_input = _effective_input_path(input_path, output_dir)

    if progress_callback:
        progress_callback(5)

    # Stage 1: single primary ONNX per tier (see vocal_stage1.extract_vocals_stage1)
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
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[DemucsHealthMarker], None] | None = None,
    job_id: str | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    2-stem separation using PyTorch Demucs only (no MDX ONNX Stage 1 waterfall).
    Same flat layout as ``run_hybrid_2stem``: ``stems/vocals.wav`` and ``stems/instrumental.wav``.
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
        effective_input,
        stage_out,
        stems=2,
        prefer_speed=prefer_speed,
        cancel_check=cancel_check,
        health_callback=health_callback,
        job_id=job_id,
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
