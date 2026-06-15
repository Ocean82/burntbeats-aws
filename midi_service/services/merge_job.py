from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from midi_service.multi_track import merge_jobs_to_multitrack, suggest_program
from midi_service.routes.common import UUID_REGEX
from midi_service.services.storage import PROGRESS_FILENAME, safe_job_path, write_metadata, write_progress


def run_merge_sync(
    job_id: str,
    out_dir: Path,
    merge_request: dict[str, Any],
    output_dir: Path,
) -> None:
    write_progress(
        out_dir,
        {
            "status": "processing",
            "job_id": job_id,
            "progress": 20,
            "message": "Loading source jobs",
        },
    )

    job_specs = merge_request.get("jobs") or []
    bpm = int(merge_request.get("bpm", 120))
    bpm = max(40, min(300, bpm))

    merge_input: list[dict[str, Any]] = []
    for spec in job_specs:
        source_job_id = str(spec.get("job_id") or "").strip()
        if not UUID_REGEX.match(source_job_id):
            raise ValueError(f"Invalid source job_id: {source_job_id}")

        progress_path = safe_job_path(output_dir, source_job_id, PROGRESS_FILENAME)
        if not progress_path.is_file():
            raise ValueError(f"Source job not found: {source_job_id}")

        progress_data = json.loads(progress_path.read_text(encoding="utf-8"))
        if progress_data.get("status") != "completed":
            raise ValueError(f"Source job not completed: {source_job_id}")

        notes = progress_data.get("result", {}).get("piano_roll_notes", [])
        stem_name = str(spec.get("stem_name") or f"Track {len(merge_input) + 1}")
        program = int(spec.get("program", -1))
        if program < 0:
            program = suggest_program(stem_name)
        merge_input.append(
            {
                "stem_name": stem_name,
                "notes": notes,
                "program": program,
                "transpose": int(spec.get("transpose", 0)),
                "is_drum": bool(spec.get("is_drum", False)),
            }
        )

    write_progress(
        out_dir,
        {
            "status": "processing",
            "job_id": job_id,
            "progress": 65,
            "message": "Merging tracks",
        },
    )

    output_path = out_dir / "multitrack.mid"
    result = merge_jobs_to_multitrack(merge_input, output_path, bpm=bpm)

    write_metadata(
        out_dir,
        {
            "job_id": job_id,
            "type": "merge",
            "track_count": result.get("track_count"),
            "total_notes": result.get("total_notes"),
            "filename": "multitrack.mid",
        },
    )

    write_progress(
        out_dir,
        {
            "status": "completed",
            "job_id": job_id,
            "progress": 100,
            "message": "Merge complete",
            "result": {
                "filename": "multitrack.mid",
                "track_count": result.get("track_count"),
                "total_notes": result.get("total_notes"),
            },
        },
    )
