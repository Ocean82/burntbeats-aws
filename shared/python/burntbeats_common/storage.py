from __future__ import annotations

import json
from pathlib import Path
from typing import Any

PROGRESS_FILENAME = "progress.json"


def safe_job_path(output_dir: Path, job_id: str, *parts: str) -> Path:
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
