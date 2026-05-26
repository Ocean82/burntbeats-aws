from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from midi_service.multi_track import merge_jobs_to_multitrack
from midi_service.services.storage import PROGRESS_FILENAME, safe_job_path

from .common import UUID_REGEX, get_output_dir, require_api_token

logger = logging.getLogger(__name__)


def build_merge_router() -> APIRouter:
    router = APIRouter()

    @router.post("/merge")
    async def merge_tracks(request: Request) -> FileResponse:
        """
        Merge multiple completed conversion jobs into a single multi-track MIDI file.
        """
        require_api_token(request)

        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        job_specs = body.get("jobs", [])
        if not job_specs or not isinstance(job_specs, list):
            raise HTTPException(status_code=400, detail="'jobs' must be a non-empty array")
        if len(job_specs) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 tracks per merge")

        bpm = int(body.get("bpm", 120))
        bpm = max(40, min(300, bpm))

        output_dir = get_output_dir(request)
        merge_input: list[dict] = []
        for spec in job_specs:
            job_id = spec.get("job_id", "")
            if not UUID_REGEX.match(job_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid job_id: {job_id}",
                )

            progress_path = safe_job_path(output_dir, job_id, PROGRESS_FILENAME)
            if not progress_path.is_file():
                raise HTTPException(
                    status_code=404,
                    detail=f"Job not found: {job_id}",
                )

            progress_data = json.loads(progress_path.read_text(encoding="utf-8"))
            if progress_data.get("status") != "completed":
                raise HTTPException(
                    status_code=400,
                    detail=f"Job not completed: {job_id}",
                )

            notes = progress_data.get("result", {}).get("piano_roll_notes", [])
            merge_input.append(
                {
                    "stem_name": spec.get(
                        "stem_name", f"Track {len(merge_input) + 1}"
                    ),
                    "notes": notes,
                    "program": int(spec.get("program", -1)),
                    "transpose": int(spec.get("transpose", 0)),
                    "is_drum": bool(spec.get("is_drum", False)),
                }
            )

            if merge_input[-1]["program"] < 0:
                from midi_service.multi_track import suggest_program

                merge_input[-1]["program"] = suggest_program(
                    merge_input[-1]["stem_name"]
                )

        merge_id = str(uuid.uuid4())
        merge_dir = safe_job_path(output_dir, merge_id)
        merge_dir.mkdir(parents=True, exist_ok=True)
        output_path = merge_dir / "multitrack.mid"

        result = merge_jobs_to_multitrack(merge_input, output_path, bpm=bpm)
        logger.info(
            "Multi-track merge complete: %d tracks, %d notes, %.1fs",
            result["track_count"],
            result["total_notes"],
            result["duration_seconds"],
        )

        return FileResponse(
            output_path,
            media_type="audio/midi",
            filename="multitrack.mid",
            headers={"X-Merge-Tracks": str(result["track_count"])},
        )

    return router
