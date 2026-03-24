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
import logging.handlers
import os
import re
import signal
import time
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
    speed_2stem_onnx_path,
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
from stem_service.split import copy_stems_to_flat_dir, run_demucs
from stem_service.hybrid import (
    run_4stem_single_pass_or_hybrid,
    run_expand_to_4stem,
    run_hybrid_2stem,
)
from stem_service.mdx_onnx import get_available_vocal_onnx
from stem_service.ultra import run_ultra_2stem, run_ultra_4stem, get_ultra_model_info
from stem_service.vocal_stage1 import get_2stem_stage1_preview
from stem_service.s3_upload import upload_job_stems_to_s3


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

    path_kind, stage1_models = get_2stem_stage1_preview()
    logger.info("2-stem Stage 1 will use: path=%s models=%s", path_kind, stage1_models)
    _sp = speed_2stem_onnx_path()
    if _sp.exists():
        logger.info("2-stem speed ONNX (when quality=speed): %s", _sp)

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
        signal.signal(
            sig, lambda s, f, name=sig.name: graceful_shutdown(name)
        )

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

STEM_SERVICE_API_TOKEN = os.environ.get("STEM_SERVICE_API_TOKEN", "")

PROGRESS_FILENAME = "progress.json"

# Per-job metrics log: one JSON object per line for comparing models and timings (mode, elapsed, RTF, etc.)
METRICS_LOG = Path(os.environ.get("STEM_METRICS_LOG", str(REPO_ROOT / "job_metrics.jsonl")))

# Use validation constants from config (single source of truth)
SUPPORTED_FORMATS = SUPPORTED_AUDIO_FORMATS


def _require_stem_service_api_token(request: Request) -> None:
    """Protect stem_service routes when it is reachable outside the trusted network."""
    if not STEM_SERVICE_API_TOKEN:
        return
    provided = request.headers.get("X-Stem-Service-Token")
    if not provided or provided != STEM_SERVICE_API_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


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


def _append_metrics_log(record: dict) -> None:
    """Append one JSON object (one line) to the metrics log for later comparison."""
    try:
        with open(METRICS_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as e:
        logger.warning("Could not append to metrics log %s: %s", METRICS_LOG, e)


def _make_job_logger(job_id: str, out_dir: Path) -> logging.Logger:
    """Create a file logger that writes to tmp/stems/{job_id}/job.log."""
    log_path = out_dir / "job.log"
    job_log = logging.getLogger(f"job.{job_id}")
    job_log.setLevel(logging.DEBUG)
    if not job_log.handlers:
        fh = logging.FileHandler(str(log_path), encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        class JsonLogFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                payload: dict[str, Any] = {
                    "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
                    "level": record.levelname,
                    "logger": record.name,
                    "message": record.getMessage(),
                    "correlation_id": getattr(record, "correlation_id", None),
                }
                if record.exc_info:
                    payload["exception"] = self.formatException(record.exc_info)
                return json.dumps(payload, ensure_ascii=False)

        fh.setFormatter(JsonLogFormatter())
        job_log.addHandler(fh)
        # Also propagate to root so uvicorn stdout shows it
        job_log.propagate = True
    return job_log


def _run_separation_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    stem_count: int,
    prefer_speed: bool,
    quality_mode: str = "quality",
    correlation_id: str = "unknown",
) -> None:
    """Blocking separation; writes progress at stages. Called from thread."""
    correlation_token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)
    # Tiered Stage-1 model lane used by vocal/instrumental ONNX selectors.
    if quality_mode == QUALITY_ULTRA:
        model_tier = "quality"
    elif prefer_speed:
        model_tier = "fast"
    elif quality_mode == "quality":
        model_tier = "quality"
    else:
        model_tier = "balanced"

    # Register job for tracking
    _running_jobs[job_id] = {
        "cancelled": False,
        "started_at": time.time(),
    }

    job_log = _make_job_logger(job_id, out_dir)
    t0 = time.monotonic()

    # Audio duration for realtime-factor (processing_time / song_length)
    audio_duration_seconds: float | None = None
    try:
        import soundfile as sf
        info = sf.info(str(input_path))
        audio_duration_seconds = float(info.duration)
    except Exception as e:
        job_log.warning("Could not get audio duration for metrics: %s", e)

    try:
        file_size_mb = input_path.stat().st_size / (1024 * 1024)
    except OSError:
        file_size_mb = 0.0

    job_log.info(
        "=== JOB START  job_id=%s  stems=%d  quality=%s  prefer_speed=%s  model_tier=%s  file=%.2fMB ===",
        job_id,
        stem_count,
        quality_mode,
        prefer_speed,
        model_tier,
        file_size_mb,
    )
    logger.info("Started job %s (quality: %s)", job_id, quality_mode)

    def on_progress(pct: int) -> None:
        if _is_job_cancelled(job_id):
            raise asyncio.CancelledError("Job cancelled by user")
        elapsed = time.monotonic() - t0
        job_log.info("progress=%d%%  elapsed=%.1fs", pct, elapsed)
        _write_progress(
            out_dir, {"status": "running", "progress": pct, "quality": quality_mode}
        )

    models_used: list[str] = []

    mode_name = (
        "2_stem_ultra" if quality_mode == QUALITY_ULTRA and stem_count == 2
        else "4_stem_ultra" if quality_mode == QUALITY_ULTRA and stem_count == 4
        else "2_stem_speed" if stem_count == 2 and prefer_speed
        else "2_stem_quality" if stem_count == 2
        else "4_stem_speed" if prefer_speed
        else "4_stem_quality"
    )

    try:
        # Ultra quality mode
        if quality_mode == QUALITY_ULTRA:
            job_log.info("Stage: ultra quality")
            if stem_count == 2:
                stem_list, models_used = run_ultra_2stem(
                    input_path,
                    out_dir,
                    progress_callback=on_progress,
                )
            else:
                stem_list, models_used = run_ultra_4stem(
                    input_path,
                    out_dir,
                    progress_callback=on_progress,
                )
        # Standard hybrid or demucs_only mode
        elif STEM_BACKEND == "hybrid":
            if stem_count == 2:
                path_kind, stage1_models = get_2stem_stage1_preview(
                    prefer_speed=prefer_speed,
                    model_tier=model_tier,
                )
                job_log.info(
                    "Stage: hybrid 2-stem  prefer_speed=%s  Stage1 path=%s models=%s",
                    prefer_speed,
                    path_kind,
                    stage1_models,
                )
                stem_list, models_used = run_hybrid_2stem(
                    input_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    model_tier=model_tier,
                    progress_callback=on_progress,
                    job_logger=job_log,
                )
            else:
                job_log.info("Stage: hybrid 4-stem  prefer_speed=%s", prefer_speed)
                stem_list, models_used = run_4stem_single_pass_or_hybrid(
                    input_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    progress_callback=on_progress,
                    job_logger=job_log,
                )
        else:
            # demucs_only: still prefer ONNX when available (best option)
            if stem_count == 2:
                path_kind, stage1_models = get_2stem_stage1_preview(
                    prefer_speed=prefer_speed,
                    model_tier=model_tier,
                )
                job_log.info(
                    "Stage: demucs_only 2-stem  prefer_speed=%s  Stage1 path=%s models=%s",
                    prefer_speed,
                    path_kind,
                    stage1_models,
                )
                stem_list, models_used = run_hybrid_2stem(
                    input_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    model_tier=model_tier,
                    progress_callback=on_progress,
                    job_logger=job_log,
                )
            else:
                flat_dir = out_dir / "stems"
                flat_dir.mkdir(parents=True, exist_ok=True)
                use_6s = not prefer_speed
                stem_list = None
                if (use_6s and demucs_onnx_6s_available()) or (
                    not use_6s and demucs_onnx_embedded_available()
                ):
                    job_log.info("Stage: demucs ONNX 4-stem  use_6s=%s", use_6s)
                    stem_list, demucs_model = run_demucs_onnx_4stem(
                        input_path,
                        flat_dir,
                        use_6s=use_6s,
                        prefer_speed=prefer_speed,
                    )
                    if stem_list is not None and demucs_model is not None:
                        models_used = [demucs_model]
                        on_progress(100)
                if stem_list is None:
                    job_log.info("Stage: demucs subprocess 4-stem")
                    stem_files = run_demucs(
                        input_path, out_dir, stems=4, prefer_speed=prefer_speed
                    )
                    on_progress(50)
                    stem_list = copy_stems_to_flat_dir(stem_files, flat_dir)
                    models_used = ["htdemucs"]
                on_progress(100)

        # Check if cancelled before marking complete
        if _is_job_cancelled(job_id):
            _write_progress(out_dir, {"status": "cancelled", "progress": 0})
            job_log.info("=== JOB CANCELLED ===")
            CORRELATION_ID_CONTEXT_VAR.reset(correlation_token)
            return

        elapsed = time.monotonic() - t0
        realtime_factor: float | None = None
        if audio_duration_seconds and audio_duration_seconds > 0:
            realtime_factor = round(elapsed / audio_duration_seconds, 4)

        stems_payload = [
            {"id": stem_id, "path": str(p.relative_to(OUTPUT_BASE))}
            for stem_id, p in stem_list
        ]
        progress_data: dict[str, Any] = {
            "status": "completed",
            "progress": 100,
            "stems": stems_payload,
            "elapsed_seconds": round(elapsed, 2),
            "audio_duration_seconds": round(audio_duration_seconds, 2) if audio_duration_seconds is not None else None,
            "realtime_factor": realtime_factor,
            "stem_count": stem_count,
            "quality_mode": quality_mode,
            "prefer_speed": prefer_speed,
            "mode_name": mode_name,
            "models_used": models_used,
        }
        s3_meta = upload_job_stems_to_s3(job_id, out_dir / "stems")
        if s3_meta:
            progress_data["s3"] = s3_meta
        _write_progress(out_dir, progress_data)

        metrics_record = {
            "job_id": job_id,
            "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "mode_name": mode_name,
            "stem_count": stem_count,
            "quality_mode": quality_mode,
            "prefer_speed": prefer_speed,
            "elapsed_seconds": round(elapsed, 2),
            "audio_duration_seconds": round(audio_duration_seconds, 2) if audio_duration_seconds is not None else None,
            "realtime_factor": realtime_factor,
            "models_used": models_used,
        }
        _append_metrics_log(metrics_record)

        job_log.info(
            "=== JOB COMPLETE  elapsed=%.1fs  audio=%.1fs  RTF=%s  mode=%s  models=%s ===",
            elapsed,
            audio_duration_seconds or 0,
            realtime_factor,
            mode_name,
            models_used,
        )
        logger.info("Completed job %s in %.1fs (mode=%s, RTF=%s)", job_id, elapsed, mode_name, realtime_factor)
    except Exception as e:
        elapsed = time.monotonic() - t0
        job_log.exception("=== JOB FAILED  elapsed=%.1fs  error=%s ===", elapsed, e)
        logger.exception("Separation failed for job %s", job_id)
        _write_progress(out_dir, {"status": "failed", "progress": 0, "error": str(e)})
    CORRELATION_ID_CONTEXT_VAR.reset(correlation_token)


def _run_expand_sync(
    expand_job_id: str,
    source_job_id: str,
    out_dir: Path,
    prefer_speed: bool,
    correlation_id: str = "unknown",
) -> None:
    """Blocking expand 2-stem → 4-stem; writes progress. Called from thread."""
    correlation_token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)
    _running_jobs[expand_job_id] = {
        "cancelled": False,
        "started_at": time.time(),
    }
    job_log = _make_job_logger(expand_job_id, out_dir)
    t0 = time.monotonic()
    source_stems_dir = OUTPUT_BASE / source_job_id / "stems"
    job_log.info("=== EXPAND START  expand_job=%s  source_job=%s ===", expand_job_id, source_job_id)

    def on_progress(pct: int) -> None:
        if _is_job_cancelled(expand_job_id):
            raise asyncio.CancelledError("Job cancelled by user")
        _write_progress(out_dir, {"status": "running", "progress": pct})

    try:
        stem_list, models_used = run_expand_to_4stem(
            source_stems_dir,
            out_dir,
            prefer_speed=prefer_speed,
            progress_callback=on_progress,
            job_logger=job_log,
        )
        if _is_job_cancelled(expand_job_id):
            _write_progress(out_dir, {"status": "cancelled", "progress": 0})
            return
        elapsed = time.monotonic() - t0
        stems_payload = [
            {"id": stem_id, "path": str(p.relative_to(OUTPUT_BASE))}
            for stem_id, p in stem_list
        ]
        expand_progress: dict[str, Any] = {
            "status": "completed",
            "progress": 100,
            "stems": stems_payload,
            "elapsed_seconds": round(elapsed, 2),
            "stem_count": 4,
            "expand_from": source_job_id,
            "models_used": models_used,
        }
        s3_meta = upload_job_stems_to_s3(expand_job_id, out_dir / "stems")
        if s3_meta:
            expand_progress["s3"] = s3_meta
        _write_progress(out_dir, expand_progress)
        job_log.info("=== EXPAND COMPLETE  elapsed=%.1fs  models=%s ===", elapsed, models_used)
    except Exception as e:
        job_log.exception("=== EXPAND FAILED  error=%s ===", e)
        _write_progress(out_dir, {"status": "failed", "progress": 0, "error": str(e)})
    finally:
        CORRELATION_ID_CONTEXT_VAR.reset(correlation_token)
        _running_jobs.pop(expand_job_id, None)


@app.post("/split")
async def split(
    request: Request,
    file: UploadFile = File(...),
    stems: str = Form("2"),
    quality: str | None = Form(None),
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
        raise HTTPException(status_code=400, detail="Invalid stems value. Must be '2' or '4'.")
    stem_count = int(stems_str)

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
        model_tier = "quality"
    elif prefer_speed:
        quality_mode = "speed"
        model_tier = "fast"
    elif quality_lower == "quality":
        quality_mode = "quality"
        model_tier = "quality"
    else:
        quality_mode = "balanced"
        model_tier = "balanced"

    logger.info(
        "Split request: stems=%s, quality=%s, model_tier=%s",
        stem_count,
        quality_mode,
        model_tier,
    )

    job_id = str(uuid.uuid4())
    out_dir = OUTPUT_BASE / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # Never trust UploadFile.filename for filesystem paths. Attackers can supply
    # values like "../../etc/passwd" to escape the job directory.
    #
    # We keep the extension (so validation works for mp3/flac/etc) but force the
    # basename to a safe `input.<ext>` filename.
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
    is_valid, error_msg = _validate_audio_file(input_path)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    _write_progress(
        out_dir, {"status": "running", "progress": 0, "quality": quality_mode}
    )

    correlation_id = getattr(request.state, "correlation_id", "unknown")

    async def run_in_thread() -> None:
        await asyncio.to_thread(
            _run_separation_sync,
            job_id,
            input_path,
            out_dir,
            stem_count,
            prefer_speed,
            quality_mode,
            correlation_id,
        )

    asyncio.create_task(run_in_thread())

    return JSONResponse(
        content={"job_id": job_id, "status": "accepted"}, status_code=202
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
    source_stems_dir = OUTPUT_BASE / job_id / "stems"
    if not source_stems_dir.is_dir():
        raise HTTPException(status_code=404, detail="Job not found")
    if not (source_stems_dir / "vocals.wav").exists() or not (source_stems_dir / "instrumental.wav").exists():
        raise HTTPException(
            status_code=400,
            detail="Job is not a 2-stem result (need vocals.wav and instrumental.wav). Run 2-stem split first.",
        )
    prefer_speed = (quality or "").strip().lower() == "speed"
    expand_job_id = str(uuid.uuid4())
    out_dir = OUTPUT_BASE / expand_job_id
    out_dir.mkdir(parents=True, exist_ok=True)
    _write_progress(out_dir, {"status": "running", "progress": 0})

    correlation_id = getattr(request.state, "correlation_id", "unknown")
    asyncio.create_task(
        asyncio.to_thread(
            _run_expand_sync,
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
    progress_path = OUTPUT_BASE / job_id / PROGRESS_FILENAME
    if not progress_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        data = json.loads(progress_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        raise HTTPException(status_code=404, detail="Job not found")
    # Do not leak internal filesystem paths in API responses.
    # In non-production environments, we expose only the log filename.
    if os.environ.get("NODE_ENV", "development").lower() != "production":
        log_path = OUTPUT_BASE / job_id / "job.log"
        if log_path.exists():
            data["log"] = log_path.name
    return data


@app.delete("/split/{job_id}")
async def cancel_job(job_id: str, request: Request) -> dict:
    """Cancel a running job. Returns 200 if cancelled, 404 if job not found or already completed."""
    _require_stem_service_api_token(request)

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
    payload: dict[str, str] = {"status": "ok"}
    if os.environ.get("NODE_ENV", "development").lower() != "production":
        payload["repo_root"] = str(REPO_ROOT)
    return payload
