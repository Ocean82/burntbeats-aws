from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from midi_service.export.model import MAX_EXPORT_STEMS, parse_export_request
from midi_service.services.storage import METADATA_FILENAME, safe_job_path, write_progress

from .common import UUID_REGEX, get_output_dir, require_api_token


def build_export_router(
    *,
    enqueue_job: Callable[[dict[str, Any]], Awaitable[None]],
    get_queue_depth: Callable[[], int],
) -> APIRouter:
    router = APIRouter()

    @router.post("/export")
    async def create_export(request: Request) -> JSONResponse:
        require_api_token(request)
        try:
            body: dict[str, Any] = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        try:
            req = parse_export_request(body)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if len(req.selected_stems) > MAX_EXPORT_STEMS:
            raise HTTPException(status_code=400, detail=f"Maximum {MAX_EXPORT_STEMS} stems per export")

        export_id = str(uuid.uuid4())
        output_dir = get_output_dir(request)
        out_dir = safe_job_path(output_dir, export_id)
        out_dir.mkdir(parents=True, exist_ok=True)

        write_progress(
            out_dir,
            {
                "status": "queued",
                "job_id": export_id,
                "progress": 0,
                "message": "Queued export job",
                "queue_depth": get_queue_depth() + 1,
                "type": "export",
            },
        )

        try:
            await enqueue_job(
                {
                    "job_id": export_id,
                    "out_dir": out_dir,
                    "input_path": str(out_dir / "export.input"),
                    "job_kind": "export",
                    "export_request": {
                        "mode": req.mode.value,
                        "selected_stems": req.selected_stems,
                        "source_jobs": [
                            {
                                "job_id": source.job_id,
                                "stem_name": source.stem_name,
                                "bpm": source.bpm,
                            }
                            for source in req.source_jobs
                        ],
                        "format": req.format.value,
                        "title": req.title,
                        "artist": req.artist,
                        "genre": req.genre,
                        "time_range": req.time_range,
                    },
                }
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail="MIDI export queue is full") from exc

        return JSONResponse(status_code=202, content={"export_id": export_id, "status": "queued"})

    @router.get("/export/status/{export_id}")
    async def export_status(request: Request, export_id: str) -> dict[str, Any]:
        require_api_token(request)
        if not UUID_REGEX.match(export_id):
            raise HTTPException(status_code=400, detail="Invalid export_id")

        output_dir = get_output_dir(request)
        progress_path = safe_job_path(output_dir, export_id, "progress.json")
        if not progress_path.is_file():
            raise HTTPException(status_code=404, detail="Export job not found")
        try:
            return json.loads(progress_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="Export progress is corrupted") from exc

    @router.get("/export/file/{export_id}/{filename}")
    async def export_file(request: Request, export_id: str, filename: str) -> FileResponse:
        require_api_token(request)
        if not UUID_REGEX.match(export_id):
            raise HTTPException(status_code=400, detail="Invalid export_id")
        if "/" in filename or "\\" in filename or "\x00" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        output_dir = get_output_dir(request)
        metadata_path = safe_job_path(output_dir, export_id, METADATA_FILENAME)
        if not metadata_path.is_file():
            raise HTTPException(status_code=404, detail="Export metadata not found")
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="Export metadata is corrupted") from exc

        allowed_files = set(metadata.get("files") or [])
        if filename not in allowed_files:
            raise HTTPException(status_code=400, detail="Unknown export file")

        export_path = safe_job_path(output_dir, export_id, filename)
        if not export_path.is_file():
            raise HTTPException(status_code=404, detail="Export file not ready")

        media_type = "application/zip" if Path(filename).suffix.lower() == ".zip" else "audio/midi"
        return FileResponse(export_path, media_type=media_type, filename=filename)

    return router

