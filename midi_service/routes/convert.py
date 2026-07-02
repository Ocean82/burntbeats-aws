from __future__ import annotations

import shutil
import uuid
import logging
from pathlib import Path
from typing import Awaitable, Callable

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from midi_service.job_utils import validate_audio_file
from midi_service.services.options import build_enqueue_item, parse_convert_form_options
from midi_service.services.storage import safe_job_path, write_progress

from .common import get_output_dir, require_api_token

logger = logging.getLogger(__name__)
ALLOWED_UPLOAD_CONTENT_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/flac",
    "audio/ogg",
    "audio/webm",
    "audio/aac",
    "audio/mp4",
    "application/octet-stream",
}


def _validate_upload_content_type(file: UploadFile) -> None:
    content_type = (file.content_type or "").lower()
    if not content_type:
        return
    if content_type in ALLOWED_UPLOAD_CONTENT_TYPES:
        return
    if content_type.startswith("audio/"):
        return
    raise HTTPException(status_code=415, detail=f"Unsupported content type: {content_type}")


def build_convert_router(
    *,
    enqueue_job: Callable[[dict], Awaitable[None]],
    get_queue_depth: Callable[[], int],
) -> APIRouter:
    router = APIRouter()

    @router.post("/convert")
    async def convert(
        request: Request,
        file: UploadFile = File(...),
        min_confidence: str = Form("0.5"),
        min_note_length_ms: str = Form("58"),
        include_pitch_bends: str = Form("true"),
        quantize: str = Form("false"),
        quantize_grid: str = Form("1/16"),
        quantize_bpm: str = Form("120"),
        quantize_strength: str = Form("1.0"),
        normalize_velocity: str = Form("true"),
        target_velocity: str = Form("90"),
        max_note_length_ms: str = Form("0"),
        transpose: str = Form("0"),
        stem_job_id: str = Form(""),
        stem_name: str = Form(""),
        user_id: str = Form(""),
    ) -> JSONResponse:
        require_api_token(request)
        _validate_upload_content_type(file)

        job_id = str(uuid.uuid4())
        output_dir = get_output_dir(request)
        out_dir = safe_job_path(output_dir, job_id)
        out_dir.mkdir(parents=True, exist_ok=True)

        safe_name = Path(file.filename or "upload.wav").name
        suffix = Path(safe_name).suffix.lower() or ".wav"
        if file.filename and safe_name != file.filename:
            logger.warning("Sanitized upload filename from %s to %s", file.filename, safe_name)
        input_path = out_dir / f"input{suffix}"
        try:
            with open(input_path, "wb") as f:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
            validate_audio_file(input_path)
        except ValueError as e:
            shutil.rmtree(out_dir, ignore_errors=True)
            raise HTTPException(status_code=400, detail=str(e)) from e
        except OSError as e:
            shutil.rmtree(out_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail="Failed to save upload") from e

        try:
            options = parse_convert_form_options(
                {
                    "min_confidence": min_confidence,
                    "min_note_length_ms": min_note_length_ms,
                    "include_pitch_bends": include_pitch_bends,
                    "quantize": quantize,
                    "quantize_grid": quantize_grid,
                    "quantize_bpm": quantize_bpm,
                    "quantize_strength": quantize_strength,
                    "normalize_velocity": normalize_velocity,
                    "target_velocity": target_velocity,
                    "max_note_length_ms": max_note_length_ms,
                    "transpose": transpose,
                    "stem_job_id": stem_job_id,
                    "stem_name": stem_name,
                    "user_id": user_id,
                }
            )
        except ValueError as exc:
            shutil.rmtree(out_dir, ignore_errors=True)
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        write_progress(
            out_dir,
            {
                "status": "queued",
                "job_id": job_id,
                "progress": 0,
                "queue_depth": get_queue_depth() + 1,
            },
        )

        try:
            await enqueue_job(
                build_enqueue_item(
                    job_id=job_id,
                    out_dir=out_dir,
                    input_path=input_path,
                    options=options,
                )
            )
        except RuntimeError:
            shutil.rmtree(out_dir, ignore_errors=True)
            raise HTTPException(status_code=503, detail="MIDI service queue is full")

        return JSONResponse(
            status_code=202,
            content={"job_id": job_id, "status": "queued"},
        )

    return router
