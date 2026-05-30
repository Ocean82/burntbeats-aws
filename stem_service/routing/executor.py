"""Execute a routed SplitPlan using existing hybrid/MDX pipelines."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Callable


def _call_progress(
    progress_callback: Callable[..., None] | None,
    pct: int,
    *,
    job_kind: str | None = None,
) -> None:
    if progress_callback is None:
        return
    try:
        progress_callback(pct, job_kind)
    except TypeError:
        progress_callback(pct)

from stem_service.hybrid import run_hybrid_2stem, run_hybrid_4stem
from stem_service.routing.pipelines.parallel_mdx import run_parallel_mdx_targets
from stem_service.routing.pipelines.single_stem import run_mdx_target_stem
from stem_service.routing.pipelines.vocals_only import run_vocals_only
from stem_service.routing.router import ModelJob, SplitPlan
from stem_service.routing.targets import delivery_stem_id

logger = logging.getLogger(__name__)


def _merge_stems(
    accumulated: dict[str, Path], new_stems: list[tuple[str, Path]]
) -> None:
    for stem_id, path in new_stems:
        accumulated[stem_id] = path


def _filter_stems(
    stem_list: list[tuple[str, Path]], allowed: tuple[str, ...]
) -> list[tuple[str, Path]]:
    allowed_set = set(allowed)
    return [(sid, p) for sid, p in stem_list if sid in allowed_set]


def _rename_guitar_from_other(
    stem_list: list[tuple[str, Path]], intent_targets: tuple[str, ...]
) -> list[tuple[str, Path]]:
    if "guitar" not in intent_targets:
        return stem_list
    out: list[tuple[str, Path]] = []
    for stem_id, path in stem_list:
        if stem_id == "other" and "guitar" in intent_targets:
            guitar_path = path.parent / "guitar.wav"
            if stem_id == "other" and not (path.parent / "guitar.wav").exists():
                shutil.copy2(path, guitar_path)
            out.append(("guitar", guitar_path if guitar_path.exists() else path))
        else:
            out.append((stem_id, path))
    return out


def execute_plan(
    plan: SplitPlan,
    input_path: Path,
    output_dir: Path,
    *,
    progress_callback: Callable[..., None] | None = None,
    job_logger: logging.Logger | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    prefer_speed = plan.intent.prefer_speed()
    model_tier = "fast" if prefer_speed else "quality"
    accumulated: dict[str, Path] = {}
    models_used: list[str] = []
    jobs = plan.jobs
    job_count = max(len(jobs), 1)

    for idx, job in enumerate(jobs):
        base_pct = int(100 * idx / job_count)
        end_pct = int(100 * (idx + 1) / job_count)
        job_kind = job.kind

        def sub_progress(
            pct: int,
            _b: int = base_pct,
            _e: int = end_pct,
            _kind: str = job_kind,
        ) -> None:
            mapped = _b + int((_e - _b) * pct / 100)
            _call_progress(progress_callback, mapped, job_kind=_kind)

        if job.kind == "vocals_only":
            stems, models = run_vocals_only(
                input_path,
                output_dir,
                prefer_speed=prefer_speed,
                model_tier=model_tier,
                progress_callback=sub_progress,
                job_logger=job_logger,
            )
        elif job.kind == "karaoke":
            stems, models = run_hybrid_2stem(
                input_path,
                output_dir,
                prefer_speed=prefer_speed,
                model_tier=model_tier,
                progress_callback=sub_progress,
                job_logger=job_logger,
            )
            stems = _filter_stems(stems, ("instrumental",))
        elif job.kind == "hybrid_2":
            stems, models = run_hybrid_2stem(
                input_path,
                output_dir,
                prefer_speed=prefer_speed,
                model_tier=model_tier,
                progress_callback=sub_progress,
                job_logger=job_logger,
            )
        elif job.kind in ("hybrid_4", "demucs_4_fallback"):
            stems, models = run_hybrid_4stem(
                input_path,
                output_dir,
                prefer_speed=prefer_speed,
                model_tier=model_tier,
                progress_callback=sub_progress,
                job_logger=job_logger,
            )
            if job.kind == "demucs_4_fallback":
                models = list(models) + ["routing_fallback:demucs_4stem_extract"]
                # Map requested demucs stems (guitar → other file)
                wanted: set[str] = set()
                for t in job.targets:
                    wanted.add(delivery_stem_id(t))
                    if t == "guitar":
                        wanted.add("other")
                stems = _filter_stems(stems, tuple(wanted))
                stems = _rename_guitar_from_other(stems, plan.intent.targets)
        elif job.kind == "mdx_stem":
            target = job.targets[0]
            stems, models = run_mdx_target_stem(
                input_path,
                output_dir,
                target,
                prefer_speed=prefer_speed,
                model_tier=model_tier,
                progress_callback=sub_progress,
                job_logger=job_logger,
            )
        elif job.kind == "parallel_mdx":
            stems, models = run_parallel_mdx_targets(
                input_path,
                output_dir,
                job.targets,
                prefer_speed=prefer_speed,
                model_tier=model_tier,
                progress_callback=sub_progress,
                job_logger=job_logger,
            )
        else:
            raise RuntimeError(f"Unknown job kind: {job.kind}")

        _merge_stems(accumulated, stems)
        models_used.extend(models)

    # Final filter to plan outputs only
    final_ids = set(plan.output_stems)
    result = [
        (sid, accumulated[sid])
        for sid in plan.output_stems
        if sid in accumulated
    ]
    # Drop unrequested files from stems/ dir
    flat = output_dir / "stems"
    if flat.is_dir():
        for wav in flat.glob("*.wav"):
            stem_name = wav.stem
            if stem_name not in final_ids:
                try:
                    wav.unlink()
                except OSError:
                    pass

    if len(result) != len(final_ids):
        missing = final_ids - {sid for sid, _ in result}
        raise RuntimeError(f"Plan did not produce all requested stems: {missing}")

    return result, models_used
