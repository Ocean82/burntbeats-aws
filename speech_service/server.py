"""
FastAPI server for speech enhancement (LavaSR).
POST /enhance → 202 + job_id; poll GET /status/{job_id}; download GET /file/{job_id}/enhanced.wav
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

from speech_service.config import SPEECH_OUTPUT_DIR
from burntbeats_common.correlation import (
    CorrelationLoggingMiddleware,
    install_correlation_logging_filter,
)
from speech_service.job_queue import enqueue_job, get_queue_depth, start_worker, stop_worker
from speech_service.job_utils import (
    OUTPUT_FILENAME,
    PROGRESS_FILENAME,
    safe_job_path,
    validate_audio_file,
    write_progress,
)
from speech_service.model_runtime import verify_models_at_startup
from speech_service.pipeline import run_enhance_sync

logger = logging.getLogger(__name__)

# Install correlation ID logging filter on root logger
install_correlation_logging_filter()

# ── Service metadata ──────────────────────────────────────────────────────────
_start_time = None
_last_job_completed_at: str | None = None

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)

from burntbeats_common.auth import (
    require_configured_api_token,
    validate_service_token_at_startup,
)

SPEECH_SERVICE_API_TOKEN = os.environ.get("SPEECH_SERVICE_API_TOKEN", "")
validate_service_token_at_startup("SPEECH_SERVICE_API_TOKEN", SPEECH_SERVICE_API_TOKEN)
FRONTEND_ORIGINS = os.environ.get(
    "FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")


def _require_api_token(request: Request) -> None:
    require_configured_api_token(
        SPEECH_SERVICE_API_TOKEN,
        request.headers.get("X-Speech-Service-Token"),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _start_time
    import time
    _start_time = time.time()
    SPEECH_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    verify_models_at_startup()
    logger.info("Speech model layout OK under SPEECH_MODELS_DIR")
    await start_worker(_run_job)
    yield
    await stop_worker()


def _run_job(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    denoise: bool,
    batch: bool,
) -> None:
    global _last_job_completed_at
    run_enhance_sync(job_id, input_path, out_dir, denoise=denoise, batch=batch)
    _last_job_completed_at = job_id


app = FastAPI(title="Speech Enhance Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(CorrelationLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    import time
    from speech_service import __version__

    uptime = int(time.time() - _start_time) if _start_time else 0
    return {
        "status": "ok",
        "version": __version__,
        "uptime_seconds": uptime,
        "queue_depth": get_queue_depth(),
        "last_job_completed_at": _last_job_completed_at,
    }


@app.get("/metrics")
async def metrics():
    """Prometheus-compatible metrics endpoint."""
    from starlette.responses import Response as StarletteResponse

    from speech_service.metrics import get_metrics_text, set_queue_depth

    set_queue_depth(get_queue_depth())
    return StarletteResponse(
        content=get_metrics_text(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@app.post("/enhance")
async def enhance(
    request: Request,
    file: UploadFile = File(...),
    denoise: str = Form("true"),
    batch: str = Form("false"),
) -> JSONResponse:
    _require_api_token(request)

    job_id = str(uuid.uuid4())
    out_dir = safe_job_path(job_id)
    out_dir.mkdir(parents=True, exist_ok=True)

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

    denoise_flag = (denoise or "").strip().lower() in ("true", "1", "yes")
    batch_flag = (batch or "").strip().lower() in ("true", "1", "yes")

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
                "denoise": denoise_flag,
                "batch": batch_flag,
            }
        )
    except RuntimeError:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise HTTPException(status_code=503, detail="Speech service queue is full")

    return JSONResponse(
        status_code=202,
        content={"job_id": job_id, "status": "queued"},
    )


@app.get("/status/{job_id}")
async def status(request: Request, job_id: str) -> dict:
    _require_api_token(request)
    if not UUID_REGEX.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")

    progress_path = safe_job_path(job_id, PROGRESS_FILENAME)
    if not progress_path.is_file():
        raise HTTPException(status_code=404, detail="Job not found")

    return json.loads(progress_path.read_text(encoding="utf-8"))


@app.get("/file/{job_id}/{filename}")
async def get_file(request: Request, job_id: str, filename: str) -> FileResponse:
    _require_api_token(request)
    if not UUID_REGEX.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")
    if filename != OUTPUT_FILENAME:
        raise HTTPException(status_code=400, detail="Unknown file")

    path = safe_job_path(job_id, filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not ready")

    return FileResponse(path, media_type="audio/wav", filename=filename)
