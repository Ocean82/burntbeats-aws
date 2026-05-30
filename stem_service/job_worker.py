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
from typing import Any

from stem_service.hybrid import run_expand_to_4stem
from stem_service.routing import (
    SplitIntent,
    execute_plan,
    intent_from_legacy,
    route_intent,
)
from stem_service.routing.schema import parse_intent_dict
from stem_service.job_queue import (
    JobCancelledError,
    is_job_cancelled,
    register_running_job,
    unregister_running_job,
)
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
logger = logging.getLogger(__name__)

CORRELATION_ID_CONTEXT_VAR: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default="unknown"
)


def _finalize_stems_to_16bit(stem_list: list[tuple[str, Path]]) -> None:
    """Convert final output stems from float32 WAV to 16-bit PCM with TPDF dither.

    This is the LAST processing step before delivery. All intermediate processing
    (ONNX inference, phase inversion, Demucs) operates in float32 to avoid
    compounding quantization noise. Only the final user-facing stems are dithered
    down to 16-bit for standard playback compatibility.
    """
    import soundfile as sf

    from stem_service.audio_utils import write_wav_16bit

    for stem_id, path in stem_list:
        if not path.exists():
            continue
        try:
            info = sf.info(str(path))
            # Only convert if not already 16-bit PCM
            if info.subtype == "PCM_16":
                continue
            audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
            write_wav_16bit(path, audio, sr, dither=True)
        except Exception as e:
            # Non-fatal: leave the stem as-is if conversion fails
            logger.warning("Could not finalize %s to 16-bit: %s", stem_id, e)



def _resolve_split_intent(
    intent_payload: dict | None,
    stem_count: int,
    quality_mode: str,
) -> SplitIntent:
    if intent_payload:
        return parse_intent_dict(intent_payload)
    return intent_from_legacy(stem_count, quality_mode)


def run_separation_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    stem_count: int,
    prefer_speed: bool,
    quality_mode: str = "quality",
    correlation_id: str = "unknown",
    intent_payload: dict | None = None,
) -> None:
    """Blocking separation; writes progress at stages. Called from worker thread."""
    correlation_token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)

    split_intent = _resolve_split_intent(intent_payload, stem_count, quality_mode)
    prefer_speed = split_intent.prefer_speed()
    quality_mode = split_intent.quality_mode()
    stem_count = split_intent.legacy_stem_count()
    if split_intent.task != "full_separation":
        stem_count = len(split_intent.output_stem_ids())

    model_tier = "fast" if prefer_speed else "quality"

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
        "=== JOB START  job_id=%s  stems=%d  quality=%s  prefer_speed=%s  model_tier=%s  intent=%s  file=%.2fMB ===",
        job_id,
        stem_count,
        quality_mode,
        prefer_speed,
        model_tier,
        split_intent.to_json_dict(),
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
            build_progress_payload(
                status="running",
                progress=pct,
                stem_count=stem_count,
                quality_mode=quality_mode,
                elapsed_seconds=round(elapsed, 1),
            ),
        )

    models_used: list[str] = []

    mode_name = resolve_mode_name(stem_count, quality_mode)

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
            progress_callback=on_progress,
            job_logger=job_log,
        )

        # Check if cancelled before marking complete
        if is_job_cancelled(job_id):
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
            CORRELATION_ID_CONTEXT_VAR.reset(correlation_token)
            return

        # Finalize: convert all output stems to 16-bit PCM with TPDF dither.
        # This is the last processing step — all prior stages use float32 to
        # avoid compounding quantization noise through phase inversion / Demucs.
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
            extra={
                "stems": stems_payload,
                "audio_duration_seconds": round(audio_duration_seconds, 2)
                if audio_duration_seconds is not None
                else None,
                "realtime_factor": realtime_factor,
                "prefer_speed": prefer_speed,
                "models_used": models_used,
                "stem_runtime": get_stem_runtime_versions(),
                "artifact_delivery": "local_ready",
                "intent": split_intent.to_json_dict(),
                "routing_notes": plan.routing_notes,
            },
        )
        write_progress(out_dir, progress_data)
        schedule_completion_artifacts(
            job_id=job_id,
            out_dir=out_dir,
            analysis_source=analysis_source,
        )

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
        _span_stack.close()
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
    quality_mode: str = "quality",
    correlation_id: str = "unknown",
) -> None:
    """Blocking expand 2-stem → 4-stem; writes progress. Called from thread."""
    correlation_token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)
    register_running_job(expand_job_id)

    job_log = make_job_logger(expand_job_id, out_dir)
    t0 = time.monotonic()
    source_stems_dir = safe_job_path(source_job_id, "stems")
    job_log.info(
        "=== EXPAND START  expand_job=%s  source_job=%s ===",
        expand_job_id,
        source_job_id,
    )

    def on_progress(pct: int) -> None:
        if is_job_cancelled(expand_job_id):
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
            progress_callback=on_progress,
            job_logger=job_log,
        )
        if is_job_cancelled(expand_job_id):
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

        # Finalize: convert output stems to 16-bit PCM with TPDF dither.
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
        _span_stack.close()
        CORRELATION_ID_CONTEXT_VAR.reset(correlation_token)
        unregister_running_job(expand_job_id)
