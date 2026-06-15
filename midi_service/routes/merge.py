from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from midi_service.multi_track import merge_jobs_to_multitrack, suggest_program
from midi_service.services.storage import PROGRESS_FILENAME, safe_job_path, write_progress

from .common import UUID_REGEX, get_output_dir, require_api_token


def build_merge_router(
    *,
    enqueue_job: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    get_queue_depth: Callable[[], int] | None = None,
) -> APIRouter:
    router = APIRouter()

    def _load_merge_input(body: dict[str, Any], output_dir: Path) -> tuple[list[dict[str, Any]], int]:
        job_specs = body.get("jobs", [])
        if not job_specs or not isinstance(job_specs, list):
            raise HTTPException(status_code=400, detail="'jobs' must be a non-empty array")
        if len(job_specs) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 tracks per merge")

        bpm = int(body.get("bpm", 120))
        bpm = max(40, min(300, bpm))

        merge_input: list[dict[str, Any]] = []
        for spec in job_specs:
            job_id = spec.get("job_id", "")
            if not UUID_REGEX.match(job_id):
                raise HTTPException(status_code=400, detail=f"Invalid job_id: {job_id}")

            progress_path = safe_job_path(output_dir, job_id, PROGRESS_FILENAME)
            if not progress_path.is_file():
                raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")

            progress_data = json.loads(progress_path.read_text(encoding="utf-8"))
            if progress_data.get("status") != "completed":
                raise HTTPException(status_code=400, detail=f"Job not completed: {job_id}")

            notes = progress_data.get("result", {}).get("piano_roll_notes", [])
            stem_name = spec.get("stem_name", f"Track {len(merge_input) + 1}")
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
        return merge_input, bpm

    @router.post("/merge")
    async def merge_tracks(request: Request) -> FileResponse:
        """Merge multiple completed conversion jobs into a single multi-track MIDI file."""
        require_api_token(request)

        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        output_dir = get_output_dir(request)
        merge_input, bpm = _load_merge_input(body, output_dir)

        merge_id = str(uuid.uuid4())
        merge_dir = safe_job_path(output_dir, merge_id)
        merge_dir.mkdir(parents=True, exist_ok=True)
        output_path = merge_dir / "multitrack.mid"

        result = merge_jobs_to_multitrack(merge_input, output_path, bpm=bpm)

        return FileResponse(
            output_path,
            media_type="audio/midi",
            filename="multitrack.mid",
            headers={"X-Merge-Tracks": str(result["track_count"])},
        )

    @router.post("/merge/async")
    async def merge_tracks_async(request: Request) -> JSONResponse:
        """Queue a multi-track merge job and return merge_id for polling."""
        if enqueue_job is None or get_queue_depth is None:
            raise HTTPException(status_code=503, detail="Async merge unavailable")

        require_api_token(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        output_dir = get_output_dir(request)
        _load_merge_input(body, output_dir)

        merge_id = str(uuid.uuid4())
        out_dir = safe_job_path(output_dir, merge_id)
        out_dir.mkdir(parents=True, exist_ok=True)

        write_progress(
            out_dir,
            {
                "status": "queued",
                "job_id": merge_id,
                "progress": 0,
                "message": "Queued merge job",
                "queue_depth": get_queue_depth() + 1,
                "type": "merge",
            },
        )

        try:
            await enqueue_job(
                {
                    "job_id": merge_id,
                    "out_dir": out_dir,
                    "input_path": str(out_dir / "merge.input"),
                    "job_kind": "merge",
                    "merge_request": body,
                }
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail="MIDI merge queue is full") from exc

        return JSONResponse(status_code=202, content={"merge_id": merge_id, "status": "queued"})

    @router.get("/merge/status/{merge_id}")
    async def merge_status(request: Request, merge_id: str) -> dict[str, Any]:
        require_api_token(request)
        if not UUID_REGEX.match(merge_id):
            raise HTTPException(status_code=400, detail="Invalid merge_id")

        output_dir = get_output_dir(request)
        progress_path = safe_job_path(output_dir, merge_id, "progress.json")
        if not progress_path.is_file():
            raise HTTPException(status_code=404, detail="Merge job not found")
        try:
            return json.loads(progress_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="Merge progress is corrupted") from exc

    @router.get("/merge/file/{merge_id}/{filename}")
    async def merge_file(request: Request, merge_id: str, filename: str) -> FileResponse:
        require_api_token(request)
        if not UUID_REGEX.match(merge_id):
            raise HTTPException(status_code=400, detail="Invalid merge_id")
        if filename != "multitrack.mid":
            raise HTTPException(status_code=400, detail="Unknown merge file")

        output_dir = get_output_dir(request)
        file_path = safe_job_path(output_dir, merge_id, filename)
        if not file_path.is_file():
            raise HTTPException(status_code=404, detail="Merge file not ready")
        return FileResponse(file_path, media_type="audio/midi", filename=filename)

    return router
