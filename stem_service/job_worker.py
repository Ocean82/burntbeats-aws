"""
Job execution logic: runs stem separation and expand operations synchronously
in worker threads. Writes progress, metrics, and handles cancellation.
"""

from __future__ import annotations

import contextlib
import contextvars
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable

from stem_service.demucs_process import DemucsHealthMarker
from stem_service.hybrid import run_expand_to_4stem
from stem_service.routing import (
    SplitIntent,
    execute_plan,
    intent_from_legacy,
    route_intent,
)
from stem_service.routing.schema import parse_intent_dict
from stem_service.job_queue import JobCancelledError, JobQueue
from stem_service.job_utils import (
    OUTPUT_BASE,
    PROGRESS_FILENAME,
    append_metrics_log,
    build_progress_payload,
    make_job_logger,
    resolve_mode_name,
    safe_job_path,
    schedule_completion_artifacts,
    write_progress,
)
from stem_service.runtime_info import get_stem_runtime_versions
from stem_service.sentry_init import job_span
from stem_service.split import get_last_execution_route

logger = logging.getLogger(__name__)

CORRELATION_ID_CONTEXT_VAR: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default="unknown"
)


@contextlib.contextmanager
def _correlation_context(correlation_id: str) -> Any:
    """Guarantee ContextVar reset even if the enclosed block raises."""
    token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)
    try:
        yield
    finally:
        CORRELATION_ID_CONTEXT_VAR.reset(token)


def _log_demucs_health(job_log: logging.Logger, marker: DemucsHealthMarker) -> None:
    job_log.info(
        "demucs_health pid=%s elapsed=%.2fs silence=%.2fs last=%s",
        marker.pid,
        marker.elapsed_seconds,
        marker.seconds_since_output,
        marker.last_output_line or "(none)",
    )


def _finalize_stems_to_16bit(stem_list: list[tuple[str, Path]]) -> None:
    import soundfile as sf
    from stem_service.audio_utils import write_wav_16bit

    failed_stems: list[dict[str, str]] = []
    for stem_id, path in stem_list:
        if not path.exists():
            failed_stems.append({"stem": stem_id, "reason": "missing"})
            continue
        try:
            info = sf.info(str(path))
            if info.subtype == "PCM_16":
                continue
            audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
            write_wav_16bit(path, audio, sr, dither=True)
        except Exception as e:
            failed_stems.append({"stem": stem_id, "reason": str(e)})
    if failed_stems:
        raise RuntimeError(f"Stem finalization failed: {failed_stems}")


def _resolve_split_intent(
    intent_payload: dict | None,
    stem_count: int,
    quality_mode: str,
) -> SplitIntent:
    if intent_payload:
        intent = parse_intent_dict(intent_payload)
        logger.debug(
            "Resolved intent: task=%s targets=%s mode=%s quality=%s",
            intent.task, intent.targets, intent.mode, intent.quality,
        )
        derived_speed = intent.prefer_speed()
        derived_quality = intent.quality_mode()
        if derived_speed != (quality_mode == "speed") or derived_quality != quality_mode:
            logger.warning(
                "Intent overrides caller arguments: "
                "caller(speed=%s, quality=%s) vs intent(speed=%s, quality=%s)",
                quality_mode == "speed", quality_mode,
                derived_speed, derived_quality,
            )
        return intent
    return intent_from_legacy(stem_count, quality_mode)


# ── 6.2: Pure separation logic — no I/O side effects ─────────────────────


def _run_separation_core(
    split_intent: SplitIntent,
    input_path: Path,
    out_dir: Path,
    progress_callback: Callable[[int, str | None], None],
    cancel_check: Callable[[], bool],
    health_callback: Callable[[DemucsHealthMarker], None],
    job_log: logging.Logger,
    job_id: str,
) -> tuple[list[tuple[str, Path]], list[str], Any]:
    """Execute the routing plan and model invocations.

    Returns (stem_list, models_used, plan). All I/O is delegated to the
    callbacks provided by the caller (the I/O coordinator).
    """
    plan = route_intent(split_intent)
    job_log.info(
        "Intent routing: task=%s targets=%s jobs=%s notes=%s",
        split_intent.task,
        split_intent.targets or split_intent.mode,
        [j.kind for j in plan.jobs],
        plan.routing_notes,
    )
    stem_list, models_used = execute_plan(
        plan,
        input_path,
        out_dir,
        progress_callback=progress_callback,
        job_logger=job_log,
        cancel_check=cancel_check,
        health_callback=health_callback,
        job_id=job_id,
    )
    return stem_list, models_used, plan


# ── I/O Coordinator: separation ─────────────────────────────────────────


def run_separation_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    stem_count: int,
    prefer_speed: bool,
    quality_mode: str = "quality",
    correlation_id: str = "unknown",
    intent_payload: dict | None = None,
    job_queue: JobQueue | None = None,
) -> None:
    """Blocking separation; writes progress at stages. Called from worker thread."""
    with _correlation_context(correlation_id):
        _run_separation_sync_impl(
            job_id, input_path, out_dir, stem_count, prefer_speed,
            quality_mode, intent_payload, job_queue,
        )


def _run_separation_sync_impl(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    stem_count: int,
    prefer_speed: bool,
    quality_mode: str,
    intent_payload: dict | None,
    job_queue: JobQueue | None = None,
) -> None:
    _span_stack: contextlib.ExitStack | None = None

    if job_queue is not None:
        job_queue.register_running_job(job_id)

    split_intent = _resolve_split_intent(intent_payload, stem_count, quality_mode)

    prefer_speed = split_intent.prefer_speed()
    quality_mode = split_intent.quality_mode()
    stem_count = split_intent.legacy_stem_count()
    if split_intent.task != "full_separation":
        stem_count = len(split_intent.output_stem_ids())

    model_tier = "fast" if prefer_speed else "quality"

    job_log = make_job_logger(job_id, out_dir)
    t0 = time.monotonic()

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
        "=== JOB START  job_id=%s  stems=%d  quality=%s  prefer_speed=%s  model_tier=%s  intent=%s  file=%.2fMB ===",
        job_id, stem_count, quality_mode, prefer_speed, model_tier,
        split_intent.to_json_dict(), file_size_mb,
    )
    logger.info("Started job %s (quality: %s)", job_id, quality_mode)

    intent_dict = split_intent.to_json_dict()
    mode_name = resolve_mode_name(stem_count, quality_mode)

    def on_progress(pct: int, job_kind: str | None = None) -> None:
        if job_queue is not None and job_queue.is_job_cancelled(job_id):
            raise JobCancelledError("Job cancelled by user")
        elapsed = time.monotonic() - t0
        job_log.info("progress=%d%%  elapsed=%.1fs", pct, elapsed)
        write_progress(
            out_dir,
            build_progress_payload(
                status="running",
                progress=pct,
                stem_count=stem_count,
                quality_mode=quality_mode,
                elapsed_seconds=round(elapsed, 1),
                intent=intent_dict,
                active_job_kind=job_kind,
            ),
        )

    models_used: list[str] = []

    try:
        _span_stack = contextlib.ExitStack()
        _span_stack.enter_context(
            job_span(
                job_id,
                "stem_separation",
                stem_count=stem_count,
                quality_mode=quality_mode,
            )
        )

        # Pure logic: routing + model execution via callbacks
        stem_list, models_used, plan = _run_separation_core(
            split_intent, input_path, out_dir,
            progress_callback=on_progress,
            cancel_check=lambda: bool(job_queue is not None and job_queue.is_job_cancelled(job_id)),
            health_callback=lambda marker: _log_demucs_health(job_log, marker),
            job_log=job_log,
            job_id=job_id,
        )

        # ── I/O phase: post-processing, progress, metrics, cleanup ──

        if job_queue is not None and job_queue.is_job_cancelled(job_id):
            write_progress(
                out_dir,
                build_progress_payload(
                    status="cancelled",
                    progress=0,
                    stem_count=stem_count,
                    quality_mode=quality_mode,
                ),
            )
            job_log.info("=== JOB CANCELLED ===")
            return

        _finalize_stems_to_16bit(stem_list)

        elapsed = time.monotonic() - t0
        realtime_factor: float | None = None
        if audio_duration_seconds and audio_duration_seconds > 0:
            realtime_factor = round(elapsed / audio_duration_seconds, 4)

        stems_payload = [
            {"id": stem_id, "path": str(p.relative_to(OUTPUT_BASE))}
            for stem_id, p in stem_list
        ]

        analysis_source: Path | None = None
        for stem_id, p in stem_list:
            if stem_id in ("vocals", "drums", "instrumental"):
                analysis_source = p
                break
        if analysis_source is None and stem_list:
            analysis_source = stem_list[0][1]

        progress_data: dict[str, Any] = build_progress_payload(
            status="completed",
            progress=100,
            stem_count=stem_count,
            quality_mode=quality_mode,
            elapsed_seconds=round(elapsed, 2),
            intent=intent_dict,
            extra={
                "stems": stems_payload,
                "audio_duration_seconds": round(audio_duration_seconds, 2)
                if audio_duration_seconds is not None else None,
                "realtime_factor": realtime_factor,
                "prefer_speed": prefer_speed,
                "models_used": models_used,
                "demucs_execution_route": get_last_execution_route(),
                "stem_runtime": get_stem_runtime_versions(),
                "artifact_delivery": "local_ready",
                "routing_notes": plan.routing_notes,
            },
        )
        write_progress(out_dir, progress_data)
        schedule_completion_artifacts(
            job_id=job_id,
            out_dir=out_dir,
            analysis_source=analysis_source,
        )

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
                if audio_duration_seconds is not None else None,
                "realtime_factor": realtime_factor,
                "models_used": models_used,
                "stem_runtime": get_stem_runtime_versions(),
                "demucs_execution_route": get_last_execution_route(),
            }
            append_metrics_log(metrics_record)
            job_log.info(
                "=== JOB COMPLETE  elapsed=%.1fs  audio=%.1fs  RTF=%s  mode=%s  models=%s ===",
                elapsed, audio_duration_seconds or 0, realtime_factor,
                mode_name, models_used,
            )
            logger.info(
                "Completed job %s in %.1fs (mode=%s, RTF=%s)",
                job_id, elapsed, mode_name, realtime_factor,
            )
        except Exception as post_err:
            job_log.warning(
                "Post-complete bookkeeping failed (job left as completed): %s", post_err
            )
    except JobCancelledError:
        elapsed = time.monotonic() - t0
        job_log.info("=== JOB CANCELLED  elapsed=%.1fs ===", elapsed)
        append_metrics_log(
            {
                "job_id": job_id,
                "status": "cancelled",
                "elapsed_seconds": round(elapsed, 2),
                "demucs_execution_route": get_last_execution_route(),
            }
        )
        write_progress(
            out_dir,
            build_progress_payload(
                status="cancelled",
                progress=0,
                stem_count=stem_count,
                quality_mode=quality_mode,
            ),
        )
    except Exception as e:
        elapsed = time.monotonic() - t0
        job_log.exception("=== JOB FAILED  elapsed=%.1fs  error=%s ===", elapsed, e)
        logger.exception("Separation failed for job %s", job_id)
        append_metrics_log(
            {
                "job_id": job_id,
                "status": "failed",
                "failed": True,
                "elapsed_seconds": round(elapsed, 2),
                "error": str(e),
                "demucs_execution_route": get_last_execution_route(),
            }
        )
        write_progress(
            out_dir,
            build_progress_payload(
                status="failed",
                progress=0,
                stem_count=stem_count,
                quality_mode=quality_mode,
                extra={"error": str(e)},
            ),
        )
    finally:
        if _span_stack is not None:
            _span_stack.close()
        if job_queue is not None:
            job_queue.unregister_running_job(job_id)

        if input_path and input_path.exists():
            try:
                input_path.unlink()
                job_log.info("Deleted input file to prevent storage leak")
            except OSError as e:
                job_log.warning("Could not delete input file: %s", e)

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


# ── Expand ─────────────────────────────────────────────────────────────


def run_expand_sync(
    expand_job_id: str,
    source_job_id: str,
    out_dir: Path,
    prefer_speed: bool,
    quality_mode: str = "quality",
    correlation_id: str = "unknown",
    job_queue: JobQueue | None = None,
) -> None:
    """Blocking expand 2-stem → 4-stem; writes progress. Called from thread."""
    with _correlation_context(correlation_id):
        _run_expand_sync_impl(
            expand_job_id, source_job_id, out_dir, prefer_speed,
            quality_mode, job_queue,
        )


def _run_expand_sync_impl(
    expand_job_id: str,
    source_job_id: str,
    out_dir: Path,
    prefer_speed: bool,
    quality_mode: str,
    job_queue: JobQueue | None = None,
) -> None:
    _span_stack: contextlib.ExitStack | None = None
    if job_queue is not None:
        job_queue.register_running_job(expand_job_id)

    job_log = make_job_logger(expand_job_id, out_dir)
    t0 = time.monotonic()
    source_stems_dir = safe_job_path(source_job_id, "stems")
    job_log.info(
        "=== EXPAND START  expand_job=%s  source_job=%s ===",
        expand_job_id, source_job_id,
    )

    def on_progress(pct: int) -> None:
        if job_queue is not None and job_queue.is_job_cancelled(expand_job_id):
            raise JobCancelledError("Job cancelled by user")
        write_progress(
            out_dir,
            build_progress_payload(
                status="running",
                progress=pct,
                stem_count=4,
                quality_mode=quality_mode,
                job_type="expand",
                extra={"prefer_speed": prefer_speed},
            ),
        )

    try:
        _span_stack = contextlib.ExitStack()
        _span_stack.enter_context(
            job_span(
                expand_job_id,
                "stem_expand",
                stem_count=4,
                quality_mode=quality_mode,
            )
        )

        stem_list, models_used = run_expand_to_4stem(
            source_stems_dir,
            out_dir,
            prefer_speed=prefer_speed,
            model_tier="fast" if prefer_speed else quality_mode,
            progress_callback=on_progress,
            job_logger=job_log,
            cancel_check=lambda: bool(job_queue is not None and job_queue.is_job_cancelled(expand_job_id)),
            health_callback=lambda marker: _log_demucs_health(job_log, marker),
            job_id=expand_job_id,
        )
        if job_queue is not None and job_queue.is_job_cancelled(expand_job_id):
            write_progress(
                out_dir,
                build_progress_payload(
                    status="cancelled",
                    progress=0,
                    stem_count=4,
                    quality_mode=quality_mode,
                    job_type="expand",
                ),
            )
            return

        _finalize_stems_to_16bit(stem_list)

        elapsed = time.monotonic() - t0
        stems_payload = [
            {"id": stem_id, "path": str(p.relative_to(OUTPUT_BASE))}
            for stem_id, p in stem_list
        ]
        inherited_beat_grid: dict[str, Any] | None = None
        source_progress_path = safe_job_path(source_job_id, PROGRESS_FILENAME)
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
        expand_progress: dict[str, Any] = build_progress_payload(
            status="completed",
            progress=100,
            stem_count=4,
            quality_mode=quality_mode,
            job_type="expand",
            elapsed_seconds=round(elapsed, 2),
            extra={
                "stems": stems_payload,
                "expand_from": source_job_id,
                "prefer_speed": prefer_speed,
                "models_used": models_used,
                "demucs_execution_route": get_last_execution_route(),
                "artifact_delivery": "local_ready",
            },
        )
        if inherited_beat_grid:
            expand_progress["beat_grid"] = inherited_beat_grid
        write_progress(out_dir, expand_progress)
        schedule_completion_artifacts(
            job_id=expand_job_id,
            out_dir=out_dir,
        )
        job_log.info(
            "=== EXPAND COMPLETE  elapsed=%.1fs  models=%s ===", elapsed, models_used
        )
    except JobCancelledError:
        job_log.info("=== EXPAND CANCELLED ===")
        write_progress(
            out_dir,
            build_progress_payload(
                status="cancelled",
                progress=0,
                stem_count=4,
                quality_mode=quality_mode,
                job_type="expand",
            ),
        )
    except Exception as e:
        job_log.exception("=== EXPAND FAILED  error=%s ===", e)
        write_progress(
            out_dir,
            build_progress_payload(
                status="failed",
                progress=0,
                stem_count=4,
                quality_mode=quality_mode,
                job_type="expand",
                extra={"error": str(e)},
            ),
        )
    finally:
        if _span_stack is not None:
            _span_stack.close()
        if job_queue is not None:
            job_queue.unregister_running_job(expand_job_id)
