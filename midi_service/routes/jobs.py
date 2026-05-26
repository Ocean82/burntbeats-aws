from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from midi_service.services.storage import OUTPUT_FILENAME, PROGRESS_FILENAME, safe_job_path

from .common import UUID_REGEX, get_output_dir, require_api_token


def build_jobs_router() -> APIRouter:
    router = APIRouter()

    @router.get("/status/{job_id}")
    async def status(request: Request, job_id: str) -> dict:
        require_api_token(request)
        if not UUID_REGEX.match(job_id):
            raise HTTPException(status_code=400, detail="Invalid job_id")

        progress_path = safe_job_path(get_output_dir(request), job_id, PROGRESS_FILENAME)
        if not progress_path.is_file():
            raise HTTPException(status_code=404, detail="Job not found")

        return json.loads(progress_path.read_text(encoding="utf-8"))

    @router.get("/file/{job_id}/{filename}")
    async def get_file(request: Request, job_id: str, filename: str) -> FileResponse:
        require_api_token(request)
        if not UUID_REGEX.match(job_id):
            raise HTTPException(status_code=400, detail="Invalid job_id")
        if filename != OUTPUT_FILENAME:
            raise HTTPException(status_code=400, detail="Unknown file")

        path = safe_job_path(get_output_dir(request), job_id, filename)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="File not ready")

        return FileResponse(path, media_type="audio/midi", filename=filename)

    return router
