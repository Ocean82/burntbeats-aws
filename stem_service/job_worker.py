"""
Job execution logic: runs stem separation and expand operations synchronously
in worker threads. Writes progress, metrics, and handles cancellation.
"""

from __future__ import annotations

import contextvars
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from stem_service.config import (
    QUALITY_ULTRA,
    REPO_ROOT,
    STEM_BACKEND,
)
from stem_service.hybrid import (
    run_4stem_single_pass_or_hybrid,
    run_demucs_only_2stem,
    run_expand_to_4stem,
    run_hybrid_2stem,
)
from stem_service.job_queue import (
    JobCancelledError,
    is_job_cancelled,
    register_running_job,
    unregister_running_job,
)
from stem_service.job_utils import (
    PROGRESS_FILENAME,
    append_metrics_log,
    make_job_logger,
    schedule_s3_upload,
    write_progress,
)
from stem_service.runtime_info import get_stem_runtime_versions
from stem_service.split import copy_stems_to_flat_dir, run_demucs
from stem_service.ultra import run_ultra_2stem, run_ultra_4stem
from stem_service.vocal_stage1 import get_2stem_stage1_preview

logger = logging.getLogger(__name__)

CORRELATION_ID_CONTEXT_VAR: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default="unknown"
)

# Output base: must match Node backend STEM_OUTPUT_DIR
OUTPUT_BASE = Path(os.environ.get("STEM_OUTPUT_DIR", str(REPO_ROOT / "tmp" / "stems")))


def _safe_job_path(job_id: str, *parts: str) -> Path:
    """Construct a path under OUTPUT_BASE for a job_id with traversal protection."""
    candidate = (OUTPUT_BASE / job_id / Path(*parts) if parts else OUTPUT_BASE / job_id).resolve()
    if not str(candidate).startswith(str(OUTPUT_BASE.resolve())):
        raise ValueError(f"Path traversal detected for job_id: {job_id}")
    return candidate


def run_separation_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    stem_count: int,
    prefer_speed: bool,
    quality_mode: str = "quality",
    correlation_id: str = "unknown",
) -> None:
    """Blocking separation; writes progress at stages. Called from worker thread."""
    correlation_token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)

    # Tiered Stage-1 model lane used by vocal/instrumental ONNX selectors.
    if quality_mode == QUALITY_ULTRA:
        model_tier = "quality"
    elif prefer_speed:
        model_tier = "fast"
    elif quality_mode == "quality":
        model_tier = "quality"
    else:
        model_tier = "balanced"

    # Register job for tracking (thread-safe)
    register_running_job(job_id)

    job_log = make_job_logger(job_id, out_dir)
    t0 = time.monotonic()

    # Audio duration for realtime-factor (processing_time / song_length)
    audio_duration_seconds: float | None = None
    try:
        import soundfile as sf

        info = sf.info(str(input_path))
        audio_duration_seconds = float(info.duration)
    except Exception as e:
        job_log.warning("Could not get audio duration for metrics: %s", e)

    try:
        file_size_mb = input_path.stat().st_size / (1024 * 1024)
    except OSError:
        file_size_mb = 0.0

    job_log.info(
        "=== JOB START  job_id=%s  stems=%d  quality=%s  prefer_speed=%s  model_tier=%s  file=%.2fMB ===",
        job_id,
        stem_count,
        quality_mode,
        prefer_speed,
        model_tier,
        file_size_mb,
    )
    logger.info("Started job %s (quality: %s)", job_id, quality_mode)

    def on_progress(pct: int) -> None:
        if is_job_cancelled(job_id):
            raise JobCancelledError("Job cancelled by user")
        elapsed = time.monotonic() - t0
        job_log.info("progress=%d%%  elapsed=%.1fs", pct, elapsed)
        write_progress(
            out_dir,
            {
                "status": "running",
                "progress": pct,
                "quality": quality_mode,
                "elapsed_seconds": round(elapsed, 1),
            },
        )

    models_used: list[str] = []

    mode_name = (
        "2_stem_ultra"
        if quality_mode == QUALITY_ULTRA and stem_count == 2
        else "4_stem_ultra"
        if quality_mode == QUALITY_ULTRA and stem_count == 4
        else "2_stem_speed"
        if stem_count == 2 and prefer_speed
        else "2_stem_quality"
        if stem_count == 2
        else "4_stem_speed"
        if prefer_speed
        else "4_stem_quality"
    )

    try:
        # Ultra quality mode
        if quality_mode == QUALITY_ULTRA:
            job_log.info("Stage: ultra quality")
            if stem_count == 2:
                stem_list, models_used = run_ultra_2stem(
                    input_path,
                    out_dir,
                    progress_callback=on_progress,
                )
            else:
                stem_list, models_used = run_ultra_4stem(
                    input_path,
                    out_dir,
                    progress_callback=on_progress,
                )
        # Standard hybrid or demucs_only mode
        elif STEM_BACKEND == "hybrid":
            if stem_count == 2:
                path_kind, stage1_models = get_2stem_stage1_preview(
                    prefer_speed=prefer_speed,
                    model_tier=model_tier,
                    stem_backend=STEM_BACKEND,
                )
                job_log.info(
                    "Stage: hybrid 2-stem  prefer_speed=%s  Stage1 path=%s models=%s",
                    prefer_speed,
                    path_kind,
                    stage1_models,
                )
                stem_list, models_used = run_hybrid_2stem(
                    input_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    model_tier=model_tier,
                    progress_callback=on_progress,
                    job_logger=job_log,
                )
            else:
                job_log.info("Stage: hybrid 4-stem  prefer_speed=%s", prefer_speed)
                stem_list, models_used = run_4stem_single_pass_or_hybrid(
                    input_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    progress_callback=on_progress,
                    job_logger=job_log,
                    model_tier=model_tier,
                )
        else:
            # demucs_only: PyTorch Demucs (no Stage 1 ONNX waterfall)
            if stem_count == 2:
                path_kind, stage1_models = get_2stem_stage1_preview(
                    prefer_speed=prefer_speed,
                    model_tier=model_tier,
                    stem_backend=STEM_BACKEND,
                )
                job_log.info(
                    "Stage: demucs_only 2-stem  prefer_speed=%s  Stage1 path=%s models=%s",
                    prefer_speed,
                    path_kind,
                    stage1_models,
                )
                stem_list, models_used = run_demucs_only_2stem(
                    input_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    progress_callback=on_progress,
                    job_logger=job_log,
                )
            else:
                flat_dir = out_dir / "stems"
                flat_dir.mkdir(parents=True, exist_ok=True)
                job_log.info("Stage: demucs subprocess 4-stem (htdemucs)")
                stem_files = run_demucs(
                    input_path, out_dir, stems=4, prefer_speed=prefer_speed
                )
                on_progress(50)
                stem_list = copy_stems_to_flat_dir(stem_files, flat_dir)
                models_used = ["htdemucs"]
                on_progress(100)

        # Check if cancelled before marking complete
        if is_job_cancelled(job_id):
            write_progress(out_dir, {"status": "cancelled", "progress": 0})
            job_log.info("=== JOB CANCELLED ===")
            CORRELATION_ID_CONTEXT_VAR.reset(correlation_token)
            return

        elapsed = time.monotonic() - t0
        realtime_factor: float | None = None
        if audio_duration_seconds and audio_duration_seconds > 0:
            realtime_factor = round(elapsed / audio_duration_seconds, 4)

        stems_payload = [
            {"id": stem_id, "path": str(p.relative_to(OUTPUT_BASE))}
            for stem_id, p in stem_list
        ]

        # Optional BPM analysis (non-blocking — failure does not affect job success)
        bpm_meta: dict[str, Any] | None = None
        try:
            from stem_service.bpm_analysis import estimate_bpm

            analysis_source: Path | None = None
            for stem_id, p in stem_list:
                if stem_id in ("vocals", "drums", "instrumental"):
                    analysis_source = p
                    break
            if analysis_source is None and stem_list:
                analysis_source = stem_list[0][1]

            if analysis_source and analysis_source.exists():
                bpm_meta = estimate_bpm(analysis_source)
                if bpm_meta:
                    job_log.info(
                        "BPM estimate: bpm=%.1f offset=%.3fs confidence=%.2f",
                        bpm_meta.get("bpm", 0),
                        bpm_meta.get("beat_offset_seconds", 0),
                        bpm_meta.get("confidence", 0),
                    )
        except Exception as bpm_err:
            job_log.debug("BPM analysis skipped (non-critical): %s", bpm_err)

        progress_data: dict[str, Any] = {
            "status": "completed",
            "progress": 100,
            "stems": stems_payload,
            "elapsed_seconds": round(elapsed, 2),
            "audio_duration_seconds": round(audio_duration_seconds, 2)
            if audio_duration_seconds is not None
            else None,
            "realtime_factor": realtime_factor,
            "stem_count": stem_count,
            "quality_mode": quality_mode,
            "prefer_speed": prefer_speed,
            "mode_name": mode_name,
            "models_used": models_used,
            "stem_runtime": get_stem_runtime_versions(),
        }
        if bpm_meta:
            progress_data["beat_grid"] = bpm_meta
        write_progress(out_dir, progress_data)
        schedule_s3_upload(job_id, out_dir / "stems", out_dir, progress_data)

        # Do not let metrics / logging failures overwrite a successful job
        try:
            metrics_record = {
                "job_id": job_id,
                "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "mode_name": mode_name,
                "stem_count": stem_count,
                "quality_mode": quality_mode,
                "prefer_speed": prefer_speed,
                "elapsed_seconds": round(elapsed, 2),
                "audio_duration_seconds": round(audio_duration_seconds, 2)
                if audio_duration_seconds is not None
                else None,
                "realtime_factor": realtime_factor,
                "models_used": models_used,
                "stem_runtime": get_stem_runtime_versions(),
            }
            append_metrics_log(metrics_record)

            job_log.info(
                "=== JOB COMPLETE  elapsed=%.1fs  audio=%.1fs  RTF=%s  mode=%s  models=%s ===",
                elapsed,
                audio_duration_seconds or 0,
                realtime_factor,
                mode_name,
                models_used,
            )
            logger.info(
                "Completed job %s in %.1fs (mode=%s, RTF=%s)",
                job_id,
                elapsed,
                mode_name,
                realtime_factor,
            )
        except Exception as post_err:
            job_log.warning(
                "Post-complete bookkeeping failed (job left as completed): %s", post_err
            )
    except JobCancelledError:
        elapsed = time.monotonic() - t0
        job_log.info("=== JOB CANCELLED  elapsed=%.1fs ===", elapsed)
        write_progress(out_dir, {"status": "cancelled", "progress": 0})
    except Exception as e:
        elapsed = time.monotonic() - t0
        job_log.exception("=== JOB FAILED  elapsed=%.1fs  error=%s ===", elapsed, e)
        logger.exception("Separation failed for job %s", job_id)
        write_progress(out_dir, {"status": "failed", "progress": 0, "error": str(e)})
    finally:
        unregister_running_job(job_id)

        # Always delete the input file once processing resolves to prevent storage leaks.
        if input_path and input_path.exists():
            try:
                input_path.unlink()
                job_log.info("Deleted input file to prevent storage leak")
            except OSError as e:
                job_log.warning("Could not delete input file: %s", e)

        # Wipe stems/ only for terminal non-success states to recover disk space.
        _final_status: str | None = None
        _progress_path = out_dir / PROGRESS_FILENAME
        if _progress_path.exists():
            try:
                _final_status = json.loads(
                    _progress_path.read_text(encoding="utf-8")
                ).get("status")
            except (json.JSONDecodeError, OSError):
                pass

        if _final_status in ("cancelled", "failed"):
            stems_dir = out_dir / "stems"
            if stems_dir.exists():
                import shutil as _shutil

                try:
                    _shutil.rmtree(stems_dir, ignore_errors=True)
                    job_log.info(
                        "Wiped stems/ for %s job to recover disk space", _final_status
                    )
                except OSError:
                    pass

        CORRELATION_ID_CONTEXT_VAR.reset(correlation_token)


def run_expand_sync(
    expand_job_id: str,
    source_job_id: str,
    out_dir: Path,
    prefer_speed: bool,
    correlation_id: str = "unknown",
) -> None:
    """Blocking expand 2-stem → 4-stem; writes progress. Called from thread."""
    correlation_token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)
    register_running_job(expand_job_id)

    job_log = make_job_logger(expand_job_id, out_dir)
    t0 = time.monotonic()
    source_stems_dir = _safe_job_path(source_job_id, "stems")
    job_log.info(
        "=== EXPAND START  expand_job=%s  source_job=%s ===",
        expand_job_id,
        source_job_id,
    )

    def on_progress(pct: int) -> None:
        if is_job_cancelled(expand_job_id):
            raise JobCancelledError("Job cancelled by user")
        write_progress(out_dir, {"status": "running", "progress": pct})

    try:
        stem_list, models_used = run_expand_to_4stem(
            source_stems_dir,
            out_dir,
            prefer_speed=prefer_speed,
            progress_callback=on_progress,
            job_logger=job_log,
        )
        if is_job_cancelled(expand_job_id):
            write_progress(out_dir, {"status": "cancelled", "progress": 0})
            return
        elapsed = time.monotonic() - t0
        stems_payload = [
            {"id": stem_id, "path": str(p.relative_to(OUTPUT_BASE))}
            for stem_id, p in stem_list
        ]
        inherited_beat_grid: dict[str, Any] | None = None
        source_progress_path = _safe_job_path(source_job_id, PROGRESS_FILENAME)
        if source_progress_path.exists():
            try:
                source_progress = json.loads(
                    source_progress_path.read_text(encoding="utf-8")
                )
                candidate = source_progress.get("beat_grid")
                if isinstance(candidate, dict):
                    inherited_beat_grid = candidate
            except (json.JSONDecodeError, OSError) as err:
                job_log.debug(
                    "Could not read source beat_grid metadata for expand: %s", err
                )
        expand_progress: dict[str, Any] = {
            "status": "completed",
            "progress": 100,
            "stems": stems_payload,
            "elapsed_seconds": round(elapsed, 2),
            "stem_count": 4,
            "expand_from": source_job_id,
            "models_used": models_used,
        }
        if inherited_beat_grid:
            expand_progress["beat_grid"] = inherited_beat_grid
        write_progress(out_dir, expand_progress)
        schedule_s3_upload(expand_job_id, out_dir / "stems", out_dir, expand_progress)
        job_log.info(
            "=== EXPAND COMPLETE  elapsed=%.1fs  models=%s ===", elapsed, models_used
        )
    except JobCancelledError:
        job_log.info("=== EXPAND CANCELLED ===")
        write_progress(out_dir, {"status": "cancelled", "progress": 0})
    except Exception as e:
        job_log.exception("=== EXPAND FAILED  error=%s ===", e)
        write_progress(out_dir, {"status": "failed", "progress": 0, "error": str(e)})
    finally:
        CORRELATION_ID_CONTEXT_VAR.reset(correlation_token)
        unregister_running_job(expand_job_id)
