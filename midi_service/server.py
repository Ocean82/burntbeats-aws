"""
FastAPI server for MIDI conversion (Basic Pitch).
POST /convert → 202 + job_id; poll GET /status/{job_id}; download GET /file/{job_id}/output.mid
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from midi_service.config import MIDI_OUTPUT_DIR
from midi_service.job_queue import enqueue_job, get_queue_depth, start_worker, stop_worker
from midi_service.job_utils import (
    OUTPUT_FILENAME,
    PROGRESS_FILENAME,
    safe_job_path,
    validate_audio_file,
    write_progress,
)
from midi_service.pipeline import run_midi_convert_sync

logger = logging.getLogger(__name__)

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)

MIDI_SERVICE_API_TOKEN = os.environ.get("MIDI_SERVICE_API_TOKEN", "")
FRONTEND_ORIGINS = os.environ.get(
    "FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")


def _require_api_token(request: Request) -> None:
    """Validate the service-to-service API token if configured."""
    if not MIDI_SERVICE_API_TOKEN:
        return
    provided = request.headers.get("X-Midi-Service-Token")
    if not provided or provided != MIDI_SERVICE_API_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create output dir, start worker. Shutdown: stop worker."""
    MIDI_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("MIDI output directory: %s", MIDI_OUTPUT_DIR)
    await start_worker(_run_job)
    yield
    await stop_worker()


def _run_job(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    options: dict,
) -> None:
    """Worker callback — runs MIDI conversion synchronously in thread pool."""
    run_midi_convert_sync(job_id, input_path, out_dir, options=options)


app = FastAPI(title="MIDI Conversion Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "queue_depth": get_queue_depth()}


@app.post("/convert")
async def convert(
    request: Request,
    file: UploadFile = File(...),
    min_confidence: str = Form("0.5"),
    min_note_length_ms: str = Form("58"),
    include_pitch_bends: str = Form("true"),
) -> JSONResponse:
    """
    Accept an audio file and queue it for MIDI conversion.
    Returns 202 with a job_id for polling.
    """
    _require_api_token(request)

    job_id = str(uuid.uuid4())
    out_dir = safe_job_path(job_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded file
    suffix = Path(file.filename or "upload.wav").suffix.lower() or ".wav"
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

    # Parse conversion options
    options = {
        "min_confidence": float(min_confidence),
        "min_note_length_ms": int(min_note_length_ms),
        "include_pitch_bends": include_pitch_bends.strip().lower() in ("true", "1", "yes"),
    }

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
            {
                "job_id": job_id,
                "out_dir": out_dir,
                "input_path": str(input_path),
                "options": options,
            }
        )
    except RuntimeError:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise HTTPException(status_code=503, detail="MIDI service queue is full")

    return JSONResponse(
        status_code=202,
        content={"job_id": job_id, "status": "queued"},
    )


@app.get("/status/{job_id}")
async def status(request: Request, job_id: str) -> dict:
    """Poll conversion progress. Returns progress.json contents."""
    _require_api_token(request)
    if not UUID_REGEX.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")

    progress_path = safe_job_path(job_id, PROGRESS_FILENAME)
    if not progress_path.is_file():
        raise HTTPException(status_code=404, detail="Job not found")

    return json.loads(progress_path.read_text(encoding="utf-8"))


@app.get("/file/{job_id}/{filename}")
async def get_file(request: Request, job_id: str, filename: str) -> FileResponse:
    """Download the generated MIDI file."""
    _require_api_token(request)
    if not UUID_REGEX.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")
    if filename != OUTPUT_FILENAME:
        raise HTTPException(status_code=400, detail="Unknown file")

    path = safe_job_path(job_id, filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not ready")

    return FileResponse(
        path,
        media_type="audio/midi",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
