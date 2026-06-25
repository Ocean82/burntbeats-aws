"""
Expand workflow: 2-stem → 4-stem using MDX ONNX on the instrumental when models
are on disk, otherwise Demucs 4-stem on the instrumental (no full re-split).
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Callable

from stem_service.routing.model_bag import select_4stem_bag
from stem_service.routing.pipelines.mdx_accompaniment import run_mdx_drums_bass_other
from stem_service.split import run_demucs
from stem_service.vocal_stage1 import extract_vocals_stage1

logger = logging.getLogger(__name__)


def _stage1_only(input_path: Path, output_dir: Path) -> Path:
    """Stage 1 only: output vocals.wav to output_dir. For Rust orchestration."""
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    stage1_out = output_dir / "stage1"
    vocals_path, _, _, _ = extract_vocals_stage1(input_path, stage1_out)
    dest = output_dir / "vocals.wav"
    shutil.copy2(vocals_path, dest)
    return dest


def _stage2_only(
    instrumental_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    model_tier: str = "quality",
    cancel_check: Callable[[], bool] | None = None,
) -> list[tuple[str, Path]]:
    """Stage 2 only: MDX drums/bass/other on instrumental. Returns drums, bass, other."""
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    tier = "fast" if prefer_speed else model_tier
    stem_list, _models = run_mdx_drums_bass_other(
        instrumental_path,
        output_dir,
        prefer_speed=prefer_speed,
        model_tier=tier,
        cancel_check=cancel_check,
    )
    return stem_list


def _expand_tier(prefer_speed: bool, model_tier: str) -> str:
    return "fast" if prefer_speed or model_tier == "fast" else "quality"


def _expand_mdx_stage2_ready(prefer_speed: bool, model_tier: str) -> bool:
    return select_4stem_bag(_expand_tier(prefer_speed, model_tier)) is not None


def _run_demucs_expand_stage2(
    instrumental_path: Path,
    target_output_dir: Path,
    *,
    prefer_speed: bool = False,
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[object], None] | None = None,
    job_id: str | None = None,
    progress_callback: Callable[[int], None] | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """Demucs 4-stem on instrumental only; returns drums, bass, other."""
    stage2_out = target_output_dir / "stage2_demucs"
    stage2_out.mkdir(parents=True, exist_ok=True)
    if progress_callback:
        progress_callback(20)
    stem_files = run_demucs(
        instrumental_path,
        stage2_out,
        stems=4,
        prefer_speed=prefer_speed,
        cancel_check=cancel_check,
        health_callback=health_callback,
        job_id=job_id,
    )
    flat_dir = target_output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    result: list[tuple[str, Path]] = []
    for stem_id, src in stem_files:
        if stem_id == "vocals":
            continue
        dest = flat_dir / f"{stem_id}.wav"
        shutil.copy2(src, dest)
        result.append((stem_id, dest))
    if progress_callback:
        progress_callback(95)
    return result, ["htdemucs", "routing_fallback:expand_demucs_stage2"]


def run_expand_to_4stem(
    source_stems_dir: Path,
    target_output_dir: Path,
    prefer_speed: bool = False,
    model_tier: str = "quality",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[object], None] | None = None,
    job_id: str | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    Expand a 2-stem job (vocals + instrumental) to 4 stems.
    Copies vocals from source; runs MDX ONNX on instrumental when drum/bass models
    exist, else Demucs 4-stem on the instrumental WAV.
    """
    target_output_dir = target_output_dir.resolve()
    flat_dir = target_output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)

    vocals_src = source_stems_dir / "vocals.wav"
    instrumental_src = source_stems_dir / "instrumental.wav"
    if not vocals_src.exists() or not instrumental_src.exists():
        raise FileNotFoundError(
            f"2-stem outputs not found: need {vocals_src} and {instrumental_src}"
        )

    if progress_callback:
        progress_callback(5)
    dest_vocals = flat_dir / "vocals.wav"
    shutil.copy2(vocals_src, dest_vocals)

    if progress_callback:
        progress_callback(15)
    _log = job_logger or logger
    tier = _expand_tier(prefer_speed, model_tier)

    if _expand_mdx_stage2_ready(prefer_speed, model_tier):
        _log.info(
            "expand: MDX ONNX stage2 on instrumental (prefer_speed=%s, model_tier=%s, bag=%s)",
            prefer_speed,
            model_tier,
            select_4stem_bag(tier),
        )
        stem_files_rest, models_used = run_mdx_drums_bass_other(
            instrumental_src,
            target_output_dir,
            prefer_speed=prefer_speed,
            model_tier=tier,
            progress_callback=progress_callback,
            job_logger=job_logger,
            cancel_check=cancel_check,
        )
    else:
        _log.info(
            "expand: Demucs stage2 fallback on instrumental (prefer_speed=%s, model_tier=%s)",
            prefer_speed,
            model_tier,
        )
        stem_files_rest, models_used = _run_demucs_expand_stage2(
            instrumental_src,
            target_output_dir,
            prefer_speed=prefer_speed,
            cancel_check=cancel_check,
            health_callback=health_callback,
            job_id=job_id,
            progress_callback=progress_callback,
        )

    stem_list: list[tuple[str, Path]] = [("vocals", dest_vocals)]
    for stem_id, dest in stem_files_rest:
        flat_dest = flat_dir / f"{stem_id}.wav"
        if dest.resolve() != flat_dest.resolve():
            shutil.copy2(dest, flat_dest)
            stem_list.append((stem_id, flat_dest))
        else:
            stem_list.append((stem_id, dest))

    if progress_callback:
        progress_callback(100)
    return stem_list, models_used
