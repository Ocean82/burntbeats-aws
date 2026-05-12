"""
FastAPI server for stem separation. Accepts POST with audio file and stems=2|4.
Returns 202 with job_id; separation runs in background. Progress in progress.json per job.
GET /status/{job_id} returns current progress/stems/error.
Supports job cancellation via DELETE /split/{job_id}.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import os
import re
import signal
import subprocess
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from stem_service.config import (
    REPO_ROOT,
    STEM_BACKEND,
    htdemucs_available,
    stem_allow_missing_htdemucs_at_startup,
    QUALITY_ULTRA,
    ultra_available_for_device,
    MAX_QUEUE_DEPTH,
)
from stem_service.runtime_info import (
    get_stem_runtime_versions,
    log_stem_runtime_versions,
    verify_torchaudio_can_load_wav,
)
from stem_service.mdx_onnx import get_available_vocal_onnx
from stem_service.ultra import get_ultra_model_info
from stem_service.vocal_stage1 import get_2stem_stage1_preview

from stem_service.job_queue import (
    cancel_all_running_jobs,
    cancel_job,
    cancel_queued_job,
    enqueue_split_job,
    get_queue_condition,
    get_queued_splits,
    start_split_workers,
    stop_split_workers,
)
from stem_service.job_utils import (
    OUTPUT_BASE,
    PROGRESS_FILENAME,
    SUPPORTED_FORMATS,
    append_metrics_log,
    safe_job_path,
    schedule_s3_upload,
    validate_audio_file,
    write_progress,
)
from stem_service.job_worker import (
    run_expand_sync,
    run_separation_sync,
)
from stem_service.sentry_init import init_sentry

# Backward-compatible aliases for test monkeypatching.
# Tests use `monkeypatch.setattr(server, "_run_separation_sync", ...)` etc.
_run_separation_sync = run_separation_sync
_run_expand_sync = run_expand_sync
_append_metrics_log = append_metrics_log
_schedule_s3_upload = schedule_s3_upload


# ── Logging & Correlation ────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

CORRELATION_ID_CONTEXT_VAR: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default="unknown"
)


class CorrelationIdLoggingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = CORRELATION_ID_CONTEXT_VAR.get()
        return True


root_logger = logging.getLogger()
if not any(isinstance(f, CorrelationIdLoggingFilter) for f in root_logger.filters):
    root_logger.addFilter(CorrelationIdLoggingFilter())


class CorrelationLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to add correlation ID to each request for structured logging."""

    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id

        token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        finally:
            CORRELATION_ID_CONTEXT_VAR.reset(token)


# ── Constants ────────────────────────────────────────────────────────────────

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)

STEM_SERVICE_API_TOKEN = os.environ.get("STEM_SERVICE_API_TOKEN", "")

FRONTEND_ORIGINS = os.environ.get(
    "FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")


# ── Auth helper ──────────────────────────────────────────────────────────────

def _require_stem_service_api_token(request: Request) -> None:
    """Protect stem_service routes when it is reachable outside the trusted network."""
    if not STEM_SERVICE_API_TOKEN:
        return
    provided = request.headers.get("X-Stem-Service-Token")
    if not provided or provided != STEM_SERVICE_API_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _safe_job_path(job_id: str, *parts: str) -> Path:
    """Server-facing wrapper: raises HTTPException(400) on traversal."""
    try:
        return safe_job_path(job_id, *parts)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job_id")


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate required models at startup so first request fails fast instead of hanging."""

    init_sentry()

    log_stem_runtime_versions(logger)

    try:
        verify_torchaudio_can_load_wav()
        logger.info("torchaudio I/O smoke test passed")
    except RuntimeError as e:
        logger.error("torchaudio I/O smoke test FAILED: %s", e)
        if not stem_allow_missing_htdemucs_at_startup():
            raise
        logger.warning(
            "STEM_ALLOW_MISSING_HTDEMUCS set — continuing despite torchaudio failure"
        )

    if not htdemucs_available():
        if stem_allow_missing_htdemucs_at_startup():
            logger.warning(
                "STEM_ALLOW_MISSING_HTDEMUCS is set: starting without htdemucs weights. "
                "Demucs-backed jobs will fail until models are installed under models/."
            )
        else:
            raise RuntimeError(
                "No Demucs model found: place htdemucs.pth or htdemucs.th in models/. "
                "See README or scripts/copy-models.sh."
            )
    else:
        logger.info("Model check OK: htdemucs (models/htdemucs.pth or .th)")

    onnx_path = get_available_vocal_onnx()
    if onnx_path:
        logger.info("ONNX Stage 1 available: %s", onnx_path.name)
    else:
        logger.info("ONNX Stage 1 not available; Stage 1 will use Demucs 2-stem")

    path_kind, stage1_models = get_2stem_stage1_preview(stem_backend=STEM_BACKEND)
    logger.info(
        "2-stem Stage 1 waterfall preview (rank1→4): path=%s models=%s",
        path_kind,
        stage1_models,
    )

    # Check ultra quality models
    ultra_info = get_ultra_model_info()
    if ultra_info["best_model"]:
        logger.info("Ultra quality model available: %s", ultra_info["best_model"])
    else:
        logger.info("Ultra quality models not available (optional)")

    logger.info(f"CORS allowed origins: {FRONTEND_ORIGINS}")

    # Start the split job queue workers
    await start_split_workers(run_separation_sync)

    def graceful_shutdown(signal_name):
        logger.info(f"Received {signal_name}, initiating graceful shutdown...")
        cancel_all_running_jobs()
        logger.info("Running jobs marked for cancellation")

    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda s, f, name=sig.name: graceful_shutdown(name))

    yield

    logger.info("Shutting down stem service...")
    await stop_split_workers()


# ── App creation ─────────────────────────────────────────────────────────────

app = FastAPI(title="Stem Split Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(CorrelationLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Route handlers ───────────────────────────────────────────────────────────

@app.post("/split")
async def split(
    request: Request,
    file: UploadFile = File(...),
    stems: str = Form("2"),
    quality: str | None = Form(None),
    sample: str | None = Form(None),
) -> dict:
    """
    Start stem separation. Returns 202 with job_id. Separation runs in background.
    Poll GET /status/{job_id} for progress and stems when completed.

    quality options:
    - "speed": fastest model tier + faster chunking
    - "balanced" (default): middle model tier + quality chunking
    - "quality": higher-quality model tier + quality chunking
    - "ultra": Best separation via RoFormer checkpoints (audio-separator); slow on CPU
    """
    _require_stem_service_api_token(request)

    stems_str = (stems or "").strip()
    if stems_str not in ("2", "4"):
        raise HTTPException(
            status_code=400, detail="Invalid stems value. Must be '2' or '4'."
        )
    stem_count = int(stems_str)

    # Determine quality mode
    quality_lower = (quality or "").strip().lower()
    prefer_speed = quality_lower == "speed"
    is_ultra = quality_lower == QUALITY_ULTRA
    is_sample = (sample or "").strip().lower() in ("true", "1", "yes")

    if is_ultra and not ultra_available_for_device():
        logger.info(
            "Ultra requested on CPU. Will attempt; expect long processing times. "
            "Set USE_ULTRA_ON_CPU=1 to suppress this warning."
        )

    # Determine effective quality mode for pipeline
    if is_ultra:
        quality_mode = QUALITY_ULTRA
    elif prefer_speed:
        quality_mode = "speed"
    elif quality_lower == "quality":
        quality_mode = "quality"
    else:
        quality_mode = "balanced"

    logger.info(
        "Split request: stems=%s, quality=%s, sample=%s",
        stem_count,
        quality_mode,
        is_sample,
    )

    queue_condition = get_queue_condition()
    if queue_condition is not None:
        async with queue_condition:
            if len(get_queued_splits()) >= MAX_QUEUE_DEPTH:
                logger.warning(
                    "Rejecting split request: max queue depth %d reached", MAX_QUEUE_DEPTH
                )
                raise HTTPException(
                    status_code=429,
                    detail=f"Service capacity reached. Server is currently processing its maximum depth of {MAX_QUEUE_DEPTH} connections. Please try again later.",
                )

    job_id = str(uuid.uuid4())
    out_dir = OUTPUT_BASE / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # Never trust UploadFile.filename for filesystem paths.
    raw_filename = file.filename or "input.wav"
    base_name = re.split(r"[\\/]", raw_filename)[-1].split("\x00", 1)[0]
    suffix = Path(base_name).suffix.lower()
    if suffix not in SUPPORTED_FORMATS:
        suffix = ".wav"
    input_path = out_dir / f"input{suffix}"
    try:
        with open(input_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                f.write(chunk)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to save upload: {e}"
        ) from e

    # Validate the uploaded file
    is_valid, error_msg = validate_audio_file(input_path)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    # Clip for sample mode if requested
    if is_sample:
        from stem_service.ffmpeg_util import resolve_ffmpeg_executable

        ffmpeg_exe = resolve_ffmpeg_executable()
        if ffmpeg_exe:
            clipped_path = out_dir / f"input_sample{suffix}"
            cmd = [
                str(ffmpeg_exe),
                "-y",
                "-ss",
                "0",
                "-t",
                "60",
                "-i",
                str(input_path),
                "-c",
                "copy",
                str(clipped_path),
            ]
            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True)
                if clipped_path.exists() and clipped_path.stat().st_size > 0:
                    input_path.unlink()
                    input_path = clipped_path
                    logger.info("Clipped input to 60s for sample mode: %s", job_id)
            except subprocess.CalledProcessError as e:
                logger.error(
                    "Failed to clip sample for job %s: %s", job_id, e.stderr
                )

    correlation_id = getattr(request.state, "correlation_id", "unknown")
    queue_position = await enqueue_split_job(
        {
            "job_id": job_id,
            "input_path": input_path,
            "out_dir": out_dir,
            "stem_count": stem_count,
            "prefer_speed": prefer_speed,
            "quality_mode": quality_mode,
            "correlation_id": correlation_id,
        }
    )

    return JSONResponse(
        content={
            "job_id": job_id,
            "status": "accepted",
            "queue_position": queue_position,
        },
        status_code=202,
    )


@app.post("/expand")
async def expand(
    request: Request,
    job_id: str = Form(..., alias="job_id"),
    quality: str | None = Form(None),
) -> dict:
    """
    Expand a completed 2-stem job to 4 stems (vocals, drums, bass, other).
    Uses existing vocals + instrumental; runs Demucs on instrumental only.
    Returns 202 with new job_id. Poll GET /status/{job_id} for progress.
    """
    _require_stem_service_api_token(request)

    if not job_id or not UUID_REGEX.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")
    source_stems_dir = _safe_job_path(job_id, "stems")
    if not source_stems_dir.is_dir():
        raise HTTPException(status_code=404, detail="Job not found")
    if (
        not (source_stems_dir / "vocals.wav").exists()
        or not (source_stems_dir / "instrumental.wav").exists()
    ):
        raise HTTPException(
            status_code=400,
            detail="Job is not a 2-stem result (need vocals.wav and instrumental.wav). Run 2-stem split first.",
        )
    prefer_speed = (quality or "").strip().lower() == "speed"
    expand_job_id = str(uuid.uuid4())
    out_dir = OUTPUT_BASE / expand_job_id
    out_dir.mkdir(parents=True, exist_ok=True)
    write_progress(out_dir, {"status": "running", "progress": 0})

    correlation_id = getattr(request.state, "correlation_id", "unknown")
    asyncio.create_task(
        asyncio.to_thread(
            run_expand_sync,
            expand_job_id,
            job_id,
            out_dir,
            prefer_speed,
            correlation_id,
        )
    )
    return JSONResponse(
        content={"job_id": expand_job_id, "status": "accepted"}, status_code=202
    )


@app.get("/status/{job_id}")
async def get_status(job_id: str, request: Request) -> dict:
    """Return progress for a job. 404 if job_id invalid or unknown."""
    _require_stem_service_api_token(request)

    if not job_id or not UUID_REGEX.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")
    progress_path = _safe_job_path(job_id, PROGRESS_FILENAME)
    if not progress_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        data = json.loads(progress_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        raise HTTPException(status_code=404, detail="Job not found")
    # Do not leak internal filesystem paths in API responses.
    if os.environ.get("NODE_ENV", "development").lower() != "production":
        log_path = _safe_job_path(job_id, "job.log")
        if log_path.exists():
            data["log"] = log_path.name
    return data


@app.delete("/split/{job_id}")
async def cancel_job_endpoint(job_id: str, request: Request) -> dict:
    """Cancel a running job. Returns 200 if cancelled, 404 if job not found or already completed."""
    _require_stem_service_api_token(request)

    if not job_id or not UUID_REGEX.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")

    progress_path = _safe_job_path(job_id, PROGRESS_FILENAME)

    # Check if job exists
    if not progress_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        data = json.loads(progress_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        raise HTTPException(status_code=404, detail="Job not found")

    # Check if already completed or failed
    if data.get("status") in ("completed", "failed", "cancelled"):
        return {
            "job_id": job_id,
            "status": data.get("status"),
            "message": "Job already finished",
        }

    # Try to cancel running job
    if cancel_job(job_id):
        write_progress(_safe_job_path(job_id), {"status": "cancelled", "progress": 0})
        logger.info("Job %s cancelled by user", job_id)
        return {
            "job_id": job_id,
            "status": "cancelled",
            "message": "Job cancellation requested",
        }

    # Cancel queued (not yet running) split jobs
    cancelled = await cancel_queued_job(job_id, OUTPUT_BASE)
    if cancelled:
        return {
            "job_id": job_id,
            "status": "cancelled",
            "message": "Queued job cancellation requested",
        }

    raise HTTPException(status_code=404, detail="Job not found")


@app.get("/health")
async def health() -> dict:
    payload: dict[str, object] = {
        "status": "ok",
        "runtime": get_stem_runtime_versions(),
    }
    if os.environ.get("NODE_ENV", "development").lower() != "production":
        payload["repo_root"] = str(REPO_ROOT)
    return payload
