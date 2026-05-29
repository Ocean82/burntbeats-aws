from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from midi_service.job_queue import cancel_queued_job, cancel_running_job
from midi_service.job_utils import write_progress
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

    @router.delete("/jobs/{job_id}")
    async def cancel_job(request: Request, job_id: str) -> dict:
        require_api_token(request)
        if not UUID_REGEX.match(job_id):
            raise HTTPException(status_code=400, detail="Invalid job_id")

        output_dir = get_output_dir(request)
        progress_path = safe_job_path(output_dir, job_id, PROGRESS_FILENAME)
        if not progress_path.is_file():
            raise HTTPException(status_code=404, detail="Job not found")

        progress = json.loads(progress_path.read_text(encoding="utf-8"))
        status_value = progress.get("status")
        if status_value in {"completed", "failed", "cancelled"}:
            raise HTTPException(status_code=409, detail=f"Job already {status_value}")

        job_dir = safe_job_path(output_dir, job_id)

        if cancel_running_job(job_id):
            return {
                "job_id": job_id,
                "status": "cancelled",
                "message": "Running job cancellation requested",
            }

        if await cancel_queued_job(job_id, job_dir):
            return {
                "job_id": job_id,
                "status": "cancelled",
                "message": "Queued job cancelled",
            }

        if status_value in {"queued", "processing", "accepted"}:
            write_progress(
                job_dir,
                {
                    "status": "cancelled",
                    "job_id": job_id,
                    "progress": progress.get("progress", 0),
                    "message": "Job cancelled",
                },
            )
            return {
                "job_id": job_id,
                "status": "cancelled",
                "message": "Job marked cancelled",
            }

        raise HTTPException(status_code=404, detail="Job is not queued or running")

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
