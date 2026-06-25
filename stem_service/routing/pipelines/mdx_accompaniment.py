"""MDX drums/bass extraction and residual *other* stem (no Demucs)."""

from __future__ import annotations

import logging
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable

from stem_service.job_utils import max_parallel_jobs
from stem_service.phase_inversion import create_residual_stem
from stem_service.routing.pipelines.single_stem import run_mdx_target_stem

logger = logging.getLogger(__name__)

MDX_OVERLAP = 0.5


def run_mdx_drums_bass_other(
    input_path: Path,
    output_dir: Path,
    *,
    prefer_speed: bool = False,
    model_tier: str = "quality",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: logging.Logger | None = None,
    cancel_check: "Callable[[], bool] | None" = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    Extract drums and bass via MDX ONNX, then *other* = mix − drums − bass.
    Returns stems in order: drums, bass, other.
    """
    output_dir = output_dir.resolve()
    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    work_dir = output_dir / "mdx_accompaniment"
    work_dir.mkdir(parents=True, exist_ok=True)

    stem_results: dict[str, Path] = {}
    models_used: list[str] = []
    targets = ("drums", "bass")
    max_workers = min(len(targets), max_parallel_jobs())
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
            cancel_check=cancel_check,
        )
        stem_id, path = stems[0]
        return stem_id, path, models

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_run_one, t): t for t in targets}
        for fut in as_completed(futures):
            stem_id, path, models = fut.result()
            dest = flat_dir / f"{stem_id}.wav"
            if path.resolve() != dest.resolve():
                shutil.copy2(path, dest)
            stem_results[stem_id] = dest
            models_used.extend(models)
            completed += 1
            if progress_callback:
                pct = 10 + int(70 * completed / len(targets))
                progress_callback(pct)

    other_path = flat_dir / "other.wav"
    create_residual_stem(
        input_path,
        [stem_results["drums"], stem_results["bass"]],
        other_path,
    )
    models_used.append("residual_other")

    if progress_callback:
        progress_callback(95)

    return [
        ("drums", stem_results["drums"]),
        ("bass", stem_results["bass"]),
        ("other", other_path),
    ], models_used
