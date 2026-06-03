"""
Expand workflow: 2-stem → 4-stem using MDX ONNX on the instrumental (no Demucs).
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Callable

from stem_service.routing.pipelines.mdx_accompaniment import run_mdx_drums_bass_other
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
    health_callback: Callable[[object], None] | None = None,
    job_id: str | None = None,
) -> list[tuple[str, Path]]:
    """Stage 2 only: MDX drums/bass/other on instrumental. Returns drums, bass, other."""
    _ = (cancel_check, health_callback, job_id)
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    tier = "fast" if prefer_speed else model_tier
    stem_list, _models = run_mdx_drums_bass_other(
        instrumental_path,
        output_dir,
        prefer_speed=prefer_speed,
        model_tier=tier,
    )
    return stem_list


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
    Copies vocals from source; runs MDX ONNX on instrumental for drums, bass, other.
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
    _log.info(
        "expand: MDX ONNX stage2 on instrumental (prefer_speed=%s, model_tier=%s)",
        prefer_speed,
        model_tier,
    )
    tier = "fast" if prefer_speed else model_tier
    stem_files_rest, models_used = run_mdx_drums_bass_other(
        instrumental_src,
        target_output_dir,
        prefer_speed=prefer_speed,
        model_tier=tier,
        progress_callback=progress_callback,
        job_logger=job_logger,
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
