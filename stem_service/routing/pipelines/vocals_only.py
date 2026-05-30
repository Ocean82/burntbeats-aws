"""Extract vocals only (single MDX pass)."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Callable

from stem_service.vocal_stage1 import extract_vocals_stage1

logger = logging.getLogger(__name__)


def run_vocals_only(
    input_path: Path,
    output_dir: Path,
    *,
    prefer_speed: bool = False,
    model_tier: str = "quality",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: logging.Logger | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    output_dir = output_dir.resolve()
    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    stage1_out = output_dir / "stage1"
    vocals_path, _, stage1_models, _ = extract_vocals_stage1(
        input_path,
        stage1_out,
        prefer_speed=prefer_speed,
        model_tier=model_tier,
        job_logger=job_logger,
        progress_callback=progress_callback,
        progress_range=(5, 95),
    )
    dest = flat_dir / "vocals.wav"
    shutil.copy2(vocals_path, dest)
    if progress_callback:
        progress_callback(100)
    return [("vocals", dest)], list(stage1_models)
