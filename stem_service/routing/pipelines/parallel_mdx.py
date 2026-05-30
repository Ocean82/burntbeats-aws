"""Parallel specialized MDX extractions for multiple targets."""

from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable

from stem_service.routing.pipelines.single_stem import run_mdx_target_stem

logger = logging.getLogger(__name__)


def _max_parallel() -> int:
    raw = os.environ.get("STEM_INTENT_MAX_PARALLEL", "").strip()
    if raw.isdigit():
        return max(1, int(raw))
    return max(1, (os.cpu_count() or 2) // 2)


def run_parallel_mdx_targets(
    input_path: Path,
    output_dir: Path,
    targets: tuple[str, ...],
    *,
    prefer_speed: bool = False,
    model_tier: str = "quality",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: logging.Logger | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    if len(targets) == 1:
        return run_mdx_target_stem(
            input_path,
            output_dir,
            targets[0],
            prefer_speed=prefer_speed,
            model_tier=model_tier,
            progress_callback=progress_callback,
            job_logger=job_logger,
        )

    work_dir = output_dir.resolve()
    stem_results: list[tuple[str, Path]] = []
    models_used: list[str] = []
    max_workers = min(len(targets), _max_parallel())
    completed = 0

    def _run_one(target: str) -> tuple[list[tuple[str, Path]], list[str]]:
        sub = work_dir / f"mdx_{target}"
        sub.mkdir(parents=True, exist_ok=True)
        return run_mdx_target_stem(
            input_path,
            sub,
            target,
            prefer_speed=prefer_speed,
            model_tier=model_tier,
            job_logger=job_logger,
        )

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_run_one, t): t for t in targets}
        for fut in as_completed(futures):
            target = futures[fut]
            stems, models = fut.result()
            stem_results.extend(stems)
            models_used.extend(models)
            completed += 1
            if progress_callback:
                pct = 5 + int(90 * completed / len(targets))
                progress_callback(pct)

    # Flatten into output_dir/stems/
    flat = work_dir / "stems"
    flat.mkdir(parents=True, exist_ok=True)
    final: list[tuple[str, Path]] = []
    for stem_id, path in stem_results:
        dest = flat / f"{stem_id}.wav"
        if path.resolve() != dest.resolve():
            import shutil

            shutil.copy2(path, dest)
        final.append((stem_id, dest))

    if progress_callback:
        progress_callback(100)
    return final, models_used
