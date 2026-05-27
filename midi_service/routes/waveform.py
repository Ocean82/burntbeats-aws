from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from midi_service.services.storage import safe_job_path

from .common import UUID_REGEX, get_output_dir, require_api_token
from ..services.waveform import compute_waveform
from ..services.spectrum import compute_spectrum


def build_waveform_router() -> APIRouter:
    router = APIRouter()

    @router.get("/waveform/{job_id}")
    async def get_waveform(
        request: Request,
        job_id: str,
        points: int = Query(512, ge=16, le=8192),
    ) -> JSONResponse:
        require_api_token(request)
        if not UUID_REGEX.match(job_id):
            raise HTTPException(status_code=400, detail="Invalid job_id")

        output_dir = get_output_dir(request)
        job_dir = safe_job_path(output_dir, job_id)
        audio_path = job_dir / "input.wav"
        if not audio_path.is_file():
            raise HTTPException(status_code=404, detail="Audio not found for job")

        data = compute_waveform(audio_path, display_points=points)
        return JSONResponse({"data": data, "points": points})

    @router.get("/spectrum/{job_id}")
    async def get_spectrum(
        request: Request,
        job_id: str,
        fft_size: int = Query(2048, ge=256, le=16384),
    ) -> JSONResponse:
        require_api_token(request)
        if not UUID_REGEX.match(job_id):
            raise HTTPException(status_code=400, detail="Invalid job_id")

        output_dir = get_output_dir(request)
        job_dir = safe_job_path(output_dir, job_id)
        audio_path = job_dir / "input.wav"
        if not audio_path.is_file():
            raise HTTPException(status_code=404, detail="Audio not found for job")

        data = compute_spectrum(audio_path, fft_size=fft_size)
        return JSONResponse({"data": data, "fft_size": fft_size})

    return router

