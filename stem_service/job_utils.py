"""
Shared utilities for stem separation jobs: progress tracking, metrics logging,
per-job file loggers, S3 upload scheduling, and audio validation.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from burntbeats_common.audio import (
    SUPPORTED_AUDIO_FORMATS,
    validate_audio_file as _shared_validate_audio_file,
)
from burntbeats_common.storage import PROGRESS_FILENAME, safe_job_path as _safe_job_path, write_progress as _write_progress
from stem_service.config import (
    REPO_ROOT,
    MIN_SAMPLE_RATE,
    MAX_SAMPLE_RATE,
    DEMUCS_SLO_MIN_SAMPLES,
    DEMUCS_SLO_MAX_TIMEOUT_RATE,
    DEMUCS_SLO_MAX_ERROR_RATE,
)
from stem_service.s3_upload import submit_background_task, upload_job_stems_to_s3

logger = logging.getLogger(__name__)


def max_parallel_jobs() -> int:
    """Return the max parallel worker count for stem-separation threads.

    Honour the ``STEM_INTENT_MAX_PARALLEL`` env var when set to a
    positive integer; otherwise default to half the available CPUs
    (floor of ``os.cpu_count()``, at least 1).
    """
    raw = os.environ.get("STEM_INTENT_MAX_PARALLEL", "").strip()
    if raw.isdigit():
        return max(1, int(raw))
    return max(1, (os.cpu_count() or 2) // 2)


# Output base: must match Node backend STEM_OUTPUT_DIR
OUTPUT_BASE = Path(os.environ.get("STEM_OUTPUT_DIR", str(REPO_ROOT / "tmp" / "stems")))

# Per-job metrics log: one JSON object per line for comparing models and timings
METRICS_LOG = Path(
    os.environ.get("STEM_METRICS_LOG", str(REPO_ROOT / "job_metrics.jsonl"))
)

# Use validation constants from config (single source of truth)
SUPPORTED_FORMATS = SUPPORTED_AUDIO_FORMATS


def resolve_mode_name(stem_count: int, quality_mode: str) -> str:
    """Return the canonical supported mode label for split/expand jobs."""
    lane = "speed" if quality_mode == "speed" else "quality"
    return f"{stem_count}_stem_{lane}"


def _split_running_stage(mode_name: str, progress: int) -> tuple[str, str]:
    logger.warning(
        "DEPRECATED: _split_running_stage() called with mode=%s — prefer intent-based routing",
        mode_name,
    )
    if mode_name == "2_stem_speed":
        if progress < 5:
            return ("starting", "Preparing job…")
        if progress < 90:
            return ("separating_vocals", "Separating vocals…")
        if progress < 95:
            return ("building_instrumental", "Building instrumental…")
        return ("finalizing_stems", "Finalising stems…")

    if mode_name == "2_stem_quality":
        if progress < 5:
            return ("starting", "Preparing job…")
        if progress < 90:
            return ("separating_vocals", "Separating vocals…")
        if progress < 95:
            return ("building_instrumental", "Building instrumental…")
        return ("finalizing_stems", "Finalising stems…")

    if mode_name == "4_stem_speed":
        if progress < 5:
            return ("starting", "Preparing job…")
        if progress < 80:
            return ("separating_vocals", "Separating vocals…")
        if progress < 86:
            return ("building_instrumental", "Building accompaniment…")
        if progress < 97:
            return ("splitting_accompaniment", "Splitting drums, bass & other…")
        return ("finalizing_stems", "Finalising stems…")

    if progress < 5:
        return ("starting", "Preparing job…")
    if progress < 88:
        return ("separating_vocals", "Separating vocals…")
    if progress < 92:
        return ("building_instrumental", "Building accompaniment…")
    if progress < 97:
        return ("splitting_accompaniment", "Splitting drums, bass & other…")
    return ("finalizing_stems", "Finalising stems…")


def _expand_running_stage(progress: int) -> tuple[str, str]:
    if progress < 5:
        return ("starting", "Preparing expansion…")
    if progress < 15:
        return ("copying_vocals", "Copying vocals…")
    if progress < 96:
        return ("splitting_accompaniment", "Splitting drums, bass & other…")
    return ("finalizing_stems", "Finalising stems…")


def progress_stage_snapshot(
    *,
    status: str,
    progress: int,
    job_type: str,
    mode_name: str,
    intent: dict[str, Any] | None = None,
    active_job_kind: str | None = None,
) -> tuple[str, str]:
    """Map a job status payload to a stable stage code and user-facing label."""
    if status == "queued":
        if job_type == "expand":
            return ("queued", "Waiting to expand to 4 stems…")
        if intent and job_type == "split":
            from stem_service.routing.progress_stages import intent_queued_label

            queued = intent_queued_label(intent)
            if queued:
                return ("queued", queued)
        return ("queued", "Waiting for an available worker…")
    if status == "completed":
        if job_type == "expand":
            return ("completed", "Expanded stems ready")
        return ("completed", "Stems ready")
    if status == "failed":
        return ("failed", "Split failed")
    if status == "cancelled":
        return ("cancelled", "Split cancelled")
    if job_type == "expand":
        return _expand_running_stage(progress)
    if intent and job_type == "split":
        from stem_service.routing.progress_stages import (
            intent_running_stage,
            should_use_intent_stages,
        )

        if should_use_intent_stages(intent):
            return intent_running_stage(
                intent, progress, active_job_kind=active_job_kind
            )
    return _split_running_stage(mode_name, progress)


def build_progress_payload(
    *,
    status: str,
    progress: int,
    stem_count: int,
    quality_mode: str,
    job_type: str = "split",
    queue_position: int | None = None,
    elapsed_seconds: float | None = None,
    intent: dict[str, Any] | None = None,
    active_job_kind: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a progress/status payload with canonical mode and stage metadata."""
    mode_name = resolve_mode_name(stem_count, quality_mode)
    stage_code, stage_label = progress_stage_snapshot(
        status=status,
        progress=progress,
        job_type=job_type,
        mode_name=mode_name,
        intent=intent,
        active_job_kind=active_job_kind,
    )
    payload: dict[str, Any] = {
        "status": status,
        "progress": progress,
        "job_type": job_type,
        "stem_count": stem_count,
        "quality": quality_mode,
        "quality_mode": quality_mode,
        "mode_name": mode_name,
        "progress_stage": stage_code,
        "progress_stage_label": stage_label,
    }
    if queue_position is not None:
        payload["queue_position"] = queue_position
        payload["jobs_ahead"] = max(0, queue_position - 1)
    if elapsed_seconds is not None:
        payload["elapsed_seconds"] = elapsed_seconds
    if intent is not None:
        payload["intent"] = intent
    if active_job_kind is not None:
        payload["active_job_kind"] = active_job_kind
    if extra:
        payload.update(extra)
    return payload


def safe_job_path(job_id: str, *parts: str) -> Path:
    return _safe_job_path(OUTPUT_BASE, job_id, *parts)


write_progress = _write_progress


def append_metrics_log(record: dict) -> None:
    """Append one JSON object (one line) to the metrics log for later comparison."""
    try:
        with open(METRICS_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as e:
        logger.warning("Could not append to metrics log %s: %s", METRICS_LOG, e)


def _percentile(sorted_values: list[float], p: float) -> float | None:
    if not sorted_values:
        return None
    idx = max(0, min(len(sorted_values) - 1, int(round((len(sorted_values) - 1) * p))))
    return round(sorted_values[idx], 3)


def summarize_demucs_metrics(max_rows: int = 500) -> dict[str, Any]:
    """Summarize latency/error/timeout/routing metrics from recent JSONL job records."""
    if not METRICS_LOG.exists():
        return {
            "count": 0,
            "latency_p50_s": None,
            "latency_p95_s": None,
            "timeout_rate": 0.0,
            "error_rate": 0.0,
            "routes": {},
        }

    rows: list[dict[str, Any]] = []
    try:
        lines = METRICS_LOG.read_text(encoding="utf-8").splitlines()
        for line in lines[-max_rows:]:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    except OSError:
        return {
            "count": 0,
            "latency_p50_s": None,
            "latency_p95_s": None,
            "timeout_rate": 0.0,
            "error_rate": 0.0,
            "routes": {},
        }

    durations: list[float] = []
    timed_out = 0
    failed = 0
    routes: dict[str, int] = {}
    total = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        total += 1
        elapsed = row.get("elapsed_seconds")
        if isinstance(elapsed, (int, float)):
            durations.append(float(elapsed))
        error_text = str(row.get("error", "")).lower()
        status = str(row.get("status", "")).lower()
        if "timeout" in error_text or status == "timeout":
            timed_out += 1
        if status == "failed" or row.get("failed") is True:
            failed += 1
        route = str(row.get("demucs_execution_route", "unknown"))
        routes[route] = routes.get(route, 0) + 1

    durations.sort()
    return {
        "count": total,
        "latency_p50_s": _percentile(durations, 0.5),
        "latency_p95_s": _percentile(durations, 0.95),
        "timeout_rate": round((timed_out / total), 4) if total else 0.0,
        "error_rate": round((failed / total), 4) if total else 0.0,
        "routes": routes,
    }


def evaluate_demucs_slo(metrics: dict[str, Any] | None = None) -> dict[str, Any]:
    """Evaluate rollout SLOs from recent metrics; recommend rollback when breached."""
    summary = metrics if metrics is not None else summarize_demucs_metrics()
    count = int(summary.get("count", 0))
    timeout_rate = float(summary.get("timeout_rate", 0.0))
    error_rate = float(summary.get("error_rate", 0.0))
    routes = summary.get("routes", {})

    if count < DEMUCS_SLO_MIN_SAMPLES:
        return {
            "status": "insufficient_data",
            "healthy": True,
            "breaches": [],
            "thresholds": {
                "min_samples": DEMUCS_SLO_MIN_SAMPLES,
                "max_timeout_rate": DEMUCS_SLO_MAX_TIMEOUT_RATE,
                "max_error_rate": DEMUCS_SLO_MAX_ERROR_RATE,
            },
            "sample_count": count,
            "timeout_rate": timeout_rate,
            "error_rate": error_rate,
            "routes": routes,
            "recommended_actions": [],
        }

    breaches: list[str] = []
    if timeout_rate > DEMUCS_SLO_MAX_TIMEOUT_RATE:
        breaches.append("timeout_rate")
    if error_rate > DEMUCS_SLO_MAX_ERROR_RATE:
        breaches.append("error_rate")

    healthy = not breaches
    recommended_actions: list[str] = []
    if breaches:
        recommended_actions.append(
            "Demucs SLO thresholds exceeded; review timeout/error rates"
        )

    return {
        "status": "ok" if healthy else "breach",
        "healthy": healthy,
        "breaches": breaches,
        "thresholds": {
            "min_samples": DEMUCS_SLO_MIN_SAMPLES,
            "max_timeout_rate": DEMUCS_SLO_MAX_TIMEOUT_RATE,
            "max_error_rate": DEMUCS_SLO_MAX_ERROR_RATE,
        },
        "sample_count": count,
        "timeout_rate": timeout_rate,
        "error_rate": error_rate,
        "routes": routes,
        "recommended_actions": recommended_actions,
    }


def _merge_progress(out_dir: Path, updates: dict[str, Any]) -> None:
    """Merge fields into the current progress payload without regressing completion."""
    progress_path = out_dir / PROGRESS_FILENAME
    try:
        current = json.loads(progress_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        current = {}
    if current.get("status") != "completed":
        return
    current.update(updates)
    write_progress(out_dir, current)


def make_job_logger(job_id: str, out_dir: Path) -> logging.Logger:
    """Create a file logger that writes to tmp/stems/{job_id}/job.log."""
    log_path = out_dir / "job.log"
    job_log = logging.getLogger(f"job.{job_id}")
    job_log.setLevel(logging.DEBUG)
    if not job_log.handlers:
        fh = logging.FileHandler(str(log_path), encoding="utf-8")
        fh.setLevel(logging.DEBUG)

        class JsonLogFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                payload: dict[str, Any] = {
                    "time": time.strftime(
                        "%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)
                    ),
                    "level": record.levelname,
                    "logger": record.name,
                    "message": record.getMessage(),
                    "correlation_id": getattr(record, "correlation_id", None),
                }
                if record.exc_info:
                    payload["exception"] = self.formatException(record.exc_info)
                return json.dumps(payload, ensure_ascii=False)

        fh.setFormatter(JsonLogFormatter())
        job_log.addHandler(fh)
        # Also propagate to root so uvicorn stdout shows it
        job_log.propagate = True
    return job_log


def schedule_s3_upload(
    job_id: str,
    stems_dir: Path,
    out_dir: Path,
) -> None:
    """Upload stems to S3 in the background and patch progress.json when ready."""

    def _upload() -> None:
        try:
            s3_meta = upload_job_stems_to_s3(job_id, stems_dir)
            if s3_meta:
                _merge_progress(
                    out_dir,
                    {
                        "s3": s3_meta,
                        "artifact_delivery": "uploaded",
                    },
                )
        except Exception:
            logger.exception(
                "S3 upload failed for job %s (stems still available on disk)", job_id
            )
            _merge_progress(out_dir, {"artifact_delivery": "upload_failed"})

    submit_background_task(_upload)


def schedule_completion_artifacts(
    job_id: str,
    out_dir: Path,
    analysis_source: Path | None = None,
) -> None:
    """Run optional post-completion enrichment without delaying local readiness."""

    def _finalize_optional_artifacts() -> None:
        if analysis_source and analysis_source.exists():
            try:
                from stem_service.bpm_analysis import estimate_bpm

                bpm_meta = estimate_bpm(analysis_source)
                if bpm_meta:
                    _merge_progress(out_dir, {"beat_grid": bpm_meta})
            except Exception as bpm_err:
                logger.debug("BPM analysis skipped (non-critical): %s", bpm_err)

        schedule_s3_upload(job_id, out_dir / "stems", out_dir)

    submit_background_task(_finalize_optional_artifacts)


def validate_audio_file(file_path: Path) -> tuple[bool, str]:
    try:
        _shared_validate_audio_file(file_path)
    except ValueError as e:
        return False, str(e)

    try:
        import soundfile as sf

        info = sf.info(str(file_path))
        if info.samplerate < MIN_SAMPLE_RATE or info.samplerate > MAX_SAMPLE_RATE:
            return (
                False,
                f"Unsupported sample rate {info.samplerate}. Must be between {MIN_SAMPLE_RATE} and {MAX_SAMPLE_RATE} Hz",
            )
    except Exception as e:
        logger.warning("Could not validate sample rate for %s: %s", file_path, e)

    return True, ""
