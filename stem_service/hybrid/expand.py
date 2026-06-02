"""
Expand workflow: 2-stem → 4-stem using a deterministic stage-2 Demucs pass.

Also contains _stage1_only and _stage2_only helpers used by the CLI.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Callable

from stem_service.demucs_process import DemucsHealthMarker
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
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[DemucsHealthMarker], None] | None = None,
    job_id: str | None = None,
) -> list[tuple[str, Path]]:
    """Stage 2 only: Demucs 4-stem on instrumental. Returns drums, bass, other (no vocals)."""
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    stem_files = run_demucs(
        instrumental_path,
        output_dir / "stage2",
        stems=4,
        prefer_speed=prefer_speed,
        cancel_check=cancel_check,
        health_callback=health_callback,
        job_id=job_id,
    )
    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    result: list[tuple[str, Path]] = []
    for stem_id, src in stem_files:
        if stem_id == "vocals":
            continue
        dest = flat_dir / f"{stem_id}.wav"
        shutil.copy2(src, dest)
        result.append((stem_id, dest))
    return result


def run_expand_to_4stem(
    source_stems_dir: Path,
    target_output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[DemucsHealthMarker], None] | None = None,
    job_id: str | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    Expand a 2-stem job (vocals + instrumental) to 4 stems.
    Copies vocals from source; runs one deterministic Demucs stage on instrumental
    for drums, bass, and other.
    source_stems_dir: path to job's stems/ (must contain vocals.wav and instrumental.wav).
    Returns (stem_list, models_used) with stem_list order: vocals, drums, bass, other.
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
    stage2_flat = target_output_dir / "stage2"
    stage2_flat.mkdir(parents=True, exist_ok=True)
    stem_list: list[tuple[str, Path]] = [("vocals", dest_vocals)]
    models_used: list[str] = []

    _log = job_logger or logger
    _log.info(
        "expand: using deterministic Demucs stage2 on instrumental (prefer_speed=%s)",
        prefer_speed,
    )
    stem_files_rest = _stage2_only(
        instrumental_src,
        target_output_dir,
        prefer_speed=prefer_speed,
        cancel_check=cancel_check,
        health_callback=health_callback,
        job_id=job_id,
    )
    if progress_callback:
        progress_callback(96)
    for stem_id, dest in stem_files_rest:
        stem_list.append((stem_id, dest))
    models_used = ["htdemucs_stage2"]

    if progress_callback:
        progress_callback(100)
    return stem_list, models_used
