"""
FastAPI server for stem separation. Accepts POST with audio file and stems=2|4.
Returns 202 with job_id; separation runs in background. Progress in progress.json per job.
GET /status/{job_id} returns current progress/stems/error.
Supports job cancellation via DELETE /split/{job_id}.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import signal
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from stem_service.config import (
    REPO_ROOT,
    STEM_BACKEND,
    htdemucs_available,
    QUALITY_ULTRA,
    ultra_available_for_device,
    SUPPORTED_AUDIO_FORMATS,
    MIN_SAMPLE_RATE,
    MAX_SAMPLE_RATE,
    MAX_FILE_SIZE_MB,
)
from stem_service.demucs_onnx import (
    demucs_onnx_6s_available,
    demucs_onnx_embedded_available,
    run_demucs_onnx_4stem,
)
from stem_service.hybrid import (
    run_4stem_single_pass_or_hybrid,
    run_hybrid_2stem,
)
from stem_service.mdx_onnx import get_available_vocal_onnx
from stem_service.split import copy_stems_to_flat_dir, run_demucs
from stem_service.ultra import run_ultra_2stem, run_ultra_4stem, get_ultra_model_info


class CorrelationLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to add correlation ID to each request for structured logging."""

    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id

        # Update logger context
        old_factory = logging.getLogRecordFactory()

        def record_factory(*args, **kwargs):
            record = old_factory(*args, **kwargs)
            record.correlation_id = correlation_id
            return record

        logging.setLogRecordFactory(record_factory)
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response


logger = logging.getLogger(__name__)

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)

# Job tracking for cancellation
_running_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock: asyncio.Lock | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate required models at startup so first request fails fast instead of hanging."""
    global _jobs_lock
    _jobs_lock = asyncio.Lock()

    demucs_onnx_4 = demucs_onnx_embedded_available() or demucs_onnx_6s_available()
    if not htdemucs_available() and not demucs_onnx_4:
        raise RuntimeError(
            "No Demucs model found: place htdemucs.pth/.th in models/ or htdemucs_embedded.onnx and htdemucs_6s.onnx. "
            "See README or scripts/copy-models.sh."
        )
    if demucs_onnx_4:
        logger.info(
            "Demucs ONNX 4-stem: embedded=%s, 6s=%s",
            demucs_onnx_embedded_available(),
            demucs_onnx_6s_available(),
        )
    if htdemucs_available():
        logger.info("Model check OK: htdemucs (models/htdemucs.pth or .th)")
    onnx_path = get_available_vocal_onnx()
    if onnx_path:
        logger.info("ONNX Stage 1 available: %s", onnx_path.name)
    else:
        logger.info("ONNX Stage 1 not available; Stage 1 will use Demucs 2-stem")

    # Check ultra quality models
    ultra_info = get_ultra_model_info()
    if ultra_info["best_model"]:
        logger.info("Ultra quality model available: %s", ultra_info["best_model"])
    else:
        logger.info("Ultra quality models not available (optional)")

    logger.info(f"CORS allowed origins: {FRONTEND_ORIGINS}")

    def graceful_shutdown(signal_name):
        logger.info(f"Received {signal_name}, initiating graceful shutdown...")
        for job_id in list(_running_jobs.keys()):
            _cancel_job(job_id)
        logger.info("Running jobs marked for cancellation")

    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda s, f: graceful_shutdown(sig.name))

    yield

    logger.info("Shutting down stem service...")


def _is_job_cancelled(job_id: str) -> bool:
    """Check if a job has been cancelled."""
    job = _running_jobs.get(job_id)
    return job is not None and job.get("cancelled", False)


def _cancel_job(job_id: str) -> bool:
    """Mark a job as cancelled. Returns True if job was found."""
    if job_id in _running_jobs:
        _running_jobs[job_id]["cancelled"] = True
        logger.info("Job %s marked for cancellation", job_id)
        return True
    return False


app = FastAPI(title="Stem Split Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(CorrelationLoggingMiddleware)

FRONTEND_ORIGINS = os.environ.get(
    "FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Output base: must match Node backend STEM_OUTPUT_DIR so GET /api/stems/file serves files we write here.
OUTPUT_BASE = Path(os.environ.get("STEM_OUTPUT_DIR", str(REPO_ROOT / "tmp" / "stems")))

PROGRESS_FILENAME = "progress.json"

# Use validation constants from config (single source of truth)
SUPPORTED_FORMATS = SUPPORTED_AUDIO_FORMATS


def _validate_audio_file(file_path: Path) -> tuple[bool, str]:
    """Validate audio file format, sample rate, and size. Returns (is_valid, error_message)."""
    # Check format
    if file_path.suffix.lower() not in SUPPORTED_FORMATS:
        return False, f"Unsupported format. Supported: {', '.join(SUPPORTED_FORMATS)}"

    # Check file exists and size
    if not file_path.exists():
        return False, "File not found"
    size_mb = file_path.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        return False, f"File too large. Max size: {MAX_FILE_SIZE_MB}MB"

    # Check sample rate using soundfile
    try:
        import soundfile as sf

        info = sf.info(str(file_path))
        if info.samplerate < MIN_SAMPLE_RATE or info.samplerate > MAX_SAMPLE_RATE:
            return (
                False,
                f"Unsupported sample rate {info.samplerate}. Must be between {MIN_SAMPLE_RATE} and {MAX_SAMPLE_RATE} Hz",
            )
    except Exception as e:
        logger.warning("Could not validate sample rate for %s: %s", file_path, e)
        # Allow if we can't check - demucs will handle errors

    return True, ""


def _write_progress(out_dir: Path, data: dict) -> None:
    (out_dir / PROGRESS_FILENAME).write_text(json.dumps(data), encoding="utf-8")


def _run_separation_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    stem_count: int,
    prefer_speed: bool,
    quality_mode: str = "quality",
) -> None:
    """Blocking separation; writes progress at stages. Called from thread."""
    # Register job for tracking
    _running_jobs[job_id] = {
        "cancelled": False,
        "started_at": str(Path(__file__).stat().st_mtime),
    }
    logger.info("Started job %s (quality: %s)", job_id, quality_mode)

    def on_progress(pct: int) -> None:
        if _is_job_cancelled(job_id):
            raise asyncio.CancelledError("Job cancelled by user")
        _write_progress(
            out_dir, {"status": "running", "progress": pct, "quality": quality_mode}
        )

    try:
        # Ultra quality mode
        if quality_mode == QUALITY_ULTRA:
            if stem_count == 2:
                stem_list = run_ultra_2stem(
                    input_path,
                    out_dir,
                    progress_callback=on_progress,
                )
            else:
                stem_list = run_ultra_4stem(
                    input_path,
                    out_dir,
                    progress_callback=on_progress,
                )
        # Standard hybrid or demucs_only mode
        elif STEM_BACKEND == "hybrid":
            if stem_count == 2:
                stem_list = run_hybrid_2stem(
                    input_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    progress_callback=on_progress,
                )
            else:
                stem_list = run_4stem_single_pass_or_hybrid(
                    input_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    progress_callback=on_progress,
                )
        else:
            # demucs_only: still prefer ONNX when available (best option)
            if stem_count == 2:
                stem_list = run_hybrid_2stem(
                    input_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    progress_callback=on_progress,
                )
            else:
                flat_dir = out_dir / "stems"
                flat_dir.mkdir(parents=True, exist_ok=True)
                use_6s = not prefer_speed
                stem_list = None
                if (use_6s and demucs_onnx_6s_available()) or (
                    not use_6s and demucs_onnx_embedded_available()
                ):
                    stem_list = run_demucs_onnx_4stem(
                        input_path, flat_dir, use_6s=use_6s
                    )
                if stem_list is None:
                    stem_files = run_demucs(
                        input_path, out_dir, stems=4, prefer_speed=prefer_speed
                    )
                    on_progress(50)
                    stem_list = copy_stems_to_flat_dir(stem_files, flat_dir)
                on_progress(100)

        # Check if cancelled before marking complete
        if _is_job_cancelled(job_id):
            _write_progress(out_dir, {"status": "cancelled", "progress": 0})
            return

        stems_payload = [
            {"id": stem_id, "path": str(p.relative_to(OUTPUT_BASE))}
            for stem_id, p in stem_list
        ]
        _write_progress(
            out_dir, {"status": "completed", "progress": 100, "stems": stems_payload}
        )
        logger.info("Completed job %s", job_id)
    except Exception as e:
        logger.exception("Separation failed for job %s", job_id)
        _write_progress(out_dir, {"status": "failed", "progress": 0, "error": str(e)})


@app.post("/split")
async def split(
    file: UploadFile = File(...),
    stems: str = Form("4"),
    quality: str | None = Form(None),
) -> dict:
    """
    Start stem separation. Returns 202 with job_id. Separation runs in background.
    Poll GET /status/{job_id} for progress and stems when completed.

    quality options:
    - "speed": Fast separation using VAD pre-trim + htdemucs
    - "quality" (default): Better separation with ONNX/Demucs Extra
    - "ultra": Best separation using Roformer/MDX23C models
    """
    stem_count = 4
    try:
        stem_count = int(stems)
        if stem_count not in (2, 4):
            stem_count = 4
    except ValueError:
        pass

    # Determine quality mode
    quality_lower = (quality or "").strip().lower()
    prefer_speed = quality_lower == "speed"
    is_ultra = quality_lower == QUALITY_ULTRA

    # Ultra on CPU: allowed but slow. ultra.py will raise a clear error if the
    # library (audio-separator[cpu]) is not installed — no silent downgrade.
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
    else:
        quality_mode = "quality"

    logger.info(f"Split request: stems={stem_count}, quality={quality_mode}")

    job_id = str(uuid.uuid4())
    out_dir = OUTPUT_BASE / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    input_path = out_dir / (file.filename or "input.wav")
    try:
        with open(input_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                f.write(chunk)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to save upload: {e}"
        ) from e

    # Validate the uploaded file
    is_valid, error_msg = _validate_audio_file(input_path)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    _write_progress(
        out_dir, {"status": "running", "progress": 0, "quality": quality_mode}
    )

    async def run_in_thread() -> None:
        await asyncio.to_thread(
            _run_separation_sync,
            job_id,
            input_path,
            out_dir,
            stem_count,
            prefer_speed,
            quality_mode,
        )

    asyncio.create_task(run_in_thread())

    return JSONResponse(
        content={"job_id": job_id, "status": "accepted"}, status_code=202
    )


@app.get("/status/{job_id}")
async def get_status(job_id: str) -> dict:
    """Return progress for a job. 404 if job_id invalid or unknown."""
    if not job_id or not UUID_REGEX.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")
    progress_path = OUTPUT_BASE / job_id / PROGRESS_FILENAME
    if not progress_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        data = json.loads(progress_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        raise HTTPException(status_code=404, detail="Job not found")
    return data


@app.delete("/split/{job_id}")
async def cancel_job(job_id: str) -> dict:
    """Cancel a running job. Returns 200 if cancelled, 404 if job not found or already completed."""
    if not job_id or not UUID_REGEX.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")

    progress_path = OUTPUT_BASE / job_id / PROGRESS_FILENAME

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

    # Try to cancel
    if _cancel_job(job_id):
        _write_progress(OUTPUT_BASE / job_id, {"status": "cancelled", "progress": 0})
        logger.info("Job %s cancelled by user", job_id)
        return {
            "job_id": job_id,
            "status": "cancelled",
            "message": "Job cancellation requested",
        }

    raise HTTPException(status_code=404, detail="Job not found")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "repo_root": str(REPO_ROOT)}
