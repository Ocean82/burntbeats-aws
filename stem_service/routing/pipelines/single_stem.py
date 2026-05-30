"""Single-target MDX stem extraction."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

from stem_service.mdx.inference import _run_mdx_onnx
from stem_service.routing.model_bag import resolve_single_stem_model, resolve_vocal_model
from stem_service.routing.targets import delivery_stem_id, normalize_target

logger = logging.getLogger(__name__)


def _model_path_for_target(target: str, model_tier: str) -> Path | None:
    t = normalize_target(target)
    if t == "vocals":
        tier = "fast" if model_tier == "fast" else "quality"
        return resolve_vocal_model(tier)
    return resolve_single_stem_model(t, model_tier)


def run_mdx_target_stem(
    input_path: Path,
    output_dir: Path,
    target: str,
    *,
    prefer_speed: bool = False,
    model_tier: str = "quality",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: logging.Logger | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    output_dir = output_dir.resolve()
    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    stem_id = delivery_stem_id(target)
    out_path = flat_dir / f"{stem_id}.wav"
    tier = "fast" if prefer_speed or model_tier == "fast" else "quality"
    model_path = _model_path_for_target(target, tier)
    if model_path is None:
        raise RuntimeError(f"No specialized MDX model available for target: {target}")
    overlap = 0.5 if prefer_speed else 0.75
    result = _run_mdx_onnx(
        input_path,
        out_path,
        model_path,
        overlap=overlap,
        job_logger=job_logger,
        progress_callback=progress_callback,
        progress_range=(5, 95),
    )
    if result is None:
        raise RuntimeError(f"MDX inference failed for target: {target}")
    if progress_callback:
        progress_callback(100)
    return [(stem_id, out_path)], [model_path.name]
