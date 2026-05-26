from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROGRESS_FILENAME = "progress.json"
OUTPUT_FILENAME = "output.mid"
METADATA_FILENAME = "metadata.json"
STORAGE_SENTINEL_FILENAME = ".midi-service-storage.json"


def safe_job_path(output_dir: Path, job_id: str, *parts: str) -> Path:
    """Resolve a path under an output directory with path traversal prevention."""
    candidate = (
        output_dir / job_id / Path(*parts)
        if parts
        else output_dir / job_id
    ).resolve()
    if not str(candidate).startswith(str(output_dir.resolve())):
        raise ValueError(f"Path traversal detected for job_id: {job_id}")
    return candidate


def write_progress(out_dir: Path, data: dict[str, Any]) -> None:
    (out_dir / PROGRESS_FILENAME).write_text(json.dumps(data), encoding="utf-8")


def write_metadata(out_dir: Path, data: dict[str, Any]) -> None:
    (out_dir / METADATA_FILENAME).write_text(json.dumps(data), encoding="utf-8")


def probe_storage(
    output_dir: Path,
    *,
    create_if_missing: bool = False,
    sentinel_filename: str = STORAGE_SENTINEL_FILENAME,
) -> dict[str, Any]:
    if create_if_missing:
        output_dir.mkdir(parents=True, exist_ok=True)

    resolved_output_dir = str(output_dir.resolve())
    if not output_dir.exists():
        return {
            "ok": False,
            "output_dir": str(output_dir),
            "resolved_output_dir": resolved_output_dir,
            "can_read": False,
            "can_write": False,
            "sentinel_filename": sentinel_filename,
            "error": "MIDI output directory does not exist",
        }
    if not output_dir.is_dir():
        return {
            "ok": False,
            "output_dir": str(output_dir),
            "resolved_output_dir": resolved_output_dir,
            "can_read": False,
            "can_write": False,
            "sentinel_filename": sentinel_filename,
            "error": "MIDI output path is not a directory",
        }

    can_read = os.access(output_dir, os.R_OK)
    can_write = os.access(output_dir, os.W_OK)
    if not can_write:
        return {
            "ok": False,
            "output_dir": str(output_dir),
            "resolved_output_dir": resolved_output_dir,
            "can_read": can_read,
            "can_write": can_write,
            "sentinel_filename": sentinel_filename,
            "error": "midi_service cannot write to MIDI output directory",
        }

    probe_path = output_dir / f".midi-service-probe-{uuid.uuid4().hex}.tmp"
    try:
        probe_path.write_text("ok", encoding="utf-8")
    finally:
        probe_path.unlink(missing_ok=True)

    return {
        "ok": can_read and can_write,
        "output_dir": str(output_dir),
        "resolved_output_dir": resolved_output_dir,
        "can_read": can_read,
        "can_write": can_write,
        "sentinel_filename": sentinel_filename,
    }


def write_storage_sentinel(
    output_dir: Path,
    storage: dict[str, Any],
    *,
    sentinel_filename: str = STORAGE_SENTINEL_FILENAME,
) -> None:
    if not storage.get("ok"):
        return

    sentinel_path = output_dir / sentinel_filename
    sentinel_payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "output_dir": storage["output_dir"],
        "resolved_output_dir": storage["resolved_output_dir"],
        "service": "midi_service",
    }
    sentinel_path.write_text(json.dumps(sentinel_payload), encoding="utf-8")
