"""Full 4-stem separation via parallel MDX vocals/drums/bass + residual other."""

from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable

from stem_service.phase_inversion import create_residual_stem
from stem_service.routing.model_bag import select_4stem_bag
from stem_service.routing.pipelines.single_stem import run_mdx_target_stem

logger = logging.getLogger(__name__)


def _max_parallel() -> int:
    raw = os.environ.get("STEM_INTENT_MAX_PARALLEL", "").strip()
    if raw.isdigit():
        return max(1, int(raw))
    return max(1, (os.cpu_count() or 2) // 2)


def run_mdx_4stem(
    input_path: Path,
    output_dir: Path,
    *,
    prefer_speed: bool = False,
    model_tier: str = "quality",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: logging.Logger | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    ONNX-only 4-stem: parallel vocals, drums, bass; other = mix − vocals − drums − bass.
    """
    output_dir = output_dir.resolve()
    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    work_dir = output_dir / "mdx_4stem"
    work_dir.mkdir(parents=True, exist_ok=True)

    tier = "fast" if prefer_speed or model_tier == "fast" else "quality"
    stem_bag = select_4stem_bag(tier)
    use_dedicated_other = stem_bag == "kuielab_b"
    targets: tuple[str, ...] = (
        ("vocals", "drums", "bass", "other")
        if use_dedicated_other
        else ("vocals", "drums", "bass")
    )
    stem_results: dict[str, Path] = {}
    models_used: list[str] = []
    max_workers = min(len(targets), _max_parallel())
    completed = 0

    def _run_one(target: str) -> tuple[str, Path, list[str]]:
        sub = work_dir / target
        sub.mkdir(parents=True, exist_ok=True)
        stems, models = run_mdx_target_stem(
            input_path,
            sub,
            target,
            prefer_speed=prefer_speed,
            model_tier=model_tier,
            job_logger=job_logger,
            stem_bag=stem_bag,
        )
        stem_id, path = stems[0]
        return stem_id, path, models

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_run_one, t): t for t in targets}
        for fut in as_completed(futures):
            stem_id, path, models = fut.result()
            dest = flat_dir / f"{stem_id}.wav"
            if path.resolve() != dest.resolve():
                dest.write_bytes(path.read_bytes())
            stem_results[stem_id] = dest
            models_used.extend(models)
            completed += 1
            if progress_callback:
                pct = 5 + int(80 * completed / len(targets))
                progress_callback(pct)

    if use_dedicated_other:
        other_path = stem_results["other"]
    else:
        other_path = flat_dir / "other.wav"
        create_residual_stem(
            input_path,
            [stem_results["vocals"], stem_results["drums"], stem_results["bass"]],
            other_path,
        )
        models_used.append("residual_other")

    if progress_callback:
        progress_callback(100)

    return [
        ("vocals", stem_results["vocals"]),
        ("drums", stem_results["drums"]),
        ("bass", stem_results["bass"]),
        ("other", other_path),
    ], models_used
