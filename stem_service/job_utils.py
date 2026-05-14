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

from stem_service.config import (
    REPO_ROOT,
    SUPPORTED_AUDIO_FORMATS,
    MIN_SAMPLE_RATE,
    MAX_SAMPLE_RATE,
    MAX_FILE_SIZE_MB,
)
from stem_service.s3_upload import upload_job_stems_to_s3

logger = logging.getLogger(__name__)

PROGRESS_FILENAME = "progress.json"

# Output base: must match Node backend STEM_OUTPUT_DIR
OUTPUT_BASE = Path(os.environ.get("STEM_OUTPUT_DIR", str(REPO_ROOT / "tmp" / "stems")))

# Per-job metrics log: one JSON object per line for comparing models and timings
METRICS_LOG = Path(
    os.environ.get("STEM_METRICS_LOG", str(REPO_ROOT / "job_metrics.jsonl"))
)

# Use validation constants from config (single source of truth)
SUPPORTED_FORMATS = SUPPORTED_AUDIO_FORMATS


def safe_job_path(job_id: str, *parts: str) -> Path:
    """Construct a path under OUTPUT_BASE for a job_id with traversal protection.

    Raises ValueError if the resolved path escapes OUTPUT_BASE.
    """
    candidate = (OUTPUT_BASE / job_id / Path(*parts) if parts else OUTPUT_BASE / job_id).resolve()
    if not str(candidate).startswith(str(OUTPUT_BASE.resolve())):
        raise ValueError(f"Path traversal detected for job_id: {job_id}")
    return candidate


def write_progress(out_dir: Path, data: dict) -> None:
    """Write progress.json for a job directory."""
    (out_dir / PROGRESS_FILENAME).write_text(json.dumps(data), encoding="utf-8")


def append_metrics_log(record: dict) -> None:
    """Append one JSON object (one line) to the metrics log for later comparison."""
    try:
        with open(METRICS_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as e:
        logger.warning("Could not append to metrics log %s: %s", METRICS_LOG, e)


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
    progress_data: dict[str, Any],
) -> None:
    """Upload stems to S3 synchronously and patch progress.json with S3 metadata.

    Previously this ran in a background thread, but that caused a race condition:
    the frontend would poll GET /status/:job_id, see "completed" without S3 keys,
    and the backend would record stems with s3_key=NULL in the database.

    Now the upload runs synchronously so progress.json always contains S3 metadata
    by the time the status is written as "completed". The upload is best-effort —
    if it fails, the job still completes and stems are served from local disk.
    """
    try:
        s3_meta = upload_job_stems_to_s3(job_id, stems_dir)
        if s3_meta:
            progress_data["s3"] = s3_meta
            write_progress(out_dir, progress_data)
    except Exception:
        logger.exception("S3 upload failed for job %s (stems still available on disk)", job_id)


def validate_audio_file(file_path: Path) -> tuple[bool, str]:
    """Validate audio file format, sample rate, and size. Returns (is_valid, error_message)."""
    # Check format
    if file_path.suffix.lower() not in SUPPORTED_FORMATS:
        return False, f"Unsupported format. Supported: {', '.join(SUPPORTED_FORMATS)}"

    # Check file exists and size
    if not file_path.exists():
        return False, "File not found"
    size_mb = file_path.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        return False, f"File too large. Max size: {MAX_FILE_SIZE_MB}MB"

    # Check sample rate using soundfile
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
        # Allow if we can't check - demucs will handle errors

    return True, ""
