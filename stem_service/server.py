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

from stem_service.subprocess_safe import resolve_subprocess_path, run_subprocess

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from stem_service.config import (
    REPO_ROOT,
    FOUR_STEM_BACKEND,
    DEMUCS_EXECUTION_MODE,
    htdemucs_available,
    stem_allow_missing_htdemucs_at_startup,
    MAX_QUEUE_DEPTH,
    log_cpu_budget,
)
from stem_service.runtime_info import (
    get_stem_runtime_versions,
    log_stem_runtime_versions,
    verify_torchaudio_can_load_wav,
)
from stem_service.mdx_onnx import get_available_vocal_onnx, resolve_single_vocal_onnx
from stem_service.vocal_stage1 import get_2stem_stage1_preview

from stem_service.job_queue import (
    cancel_all_running_jobs,
    cancel_job,
    cancel_queued_job,
    enqueue_expand_job,
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
    build_progress_payload,
    safe_job_path,
    schedule_s3_upload,
    summarize_demucs_metrics,
    evaluate_demucs_slo,
    validate_audio_file,
    write_progress,
)
from stem_service.job_worker import (
    run_expand_sync,
    run_separation_sync,
)
from stem_service.demucs_rpc import ensure_rpc_server_started, stop_rpc_server
from stem_service.sentry_init import init_sentry

# Backward-compatible aliases for test monkeypatching.
# Tests use `monkeypatch.setattr(server, "_run_separation_sync", ...)` etc.
_run_separation_sync = run_separation_sync
_run_expand_sync = run_expand_sync
_append_metrics_log = append_metrics_log
_schedule_s3_upload = schedule_s3_upload


def _supported_mode_health_snapshot() -> dict[str, object]:
    """Return readiness for the four supported deterministic CPU modes."""
    from stem_service.routing.model_bag import (
        _KUIELAB_B_BAG,
        resolve_stem_model,
        select_4stem_bag,
    )

    fast_vocal = resolve_single_vocal_onnx("UVR_MDXNET_3_9662.onnx")
    quality_vocal = resolve_single_vocal_onnx("UVR_MDXNET_KARA.onnx")
    bag_quality = select_4stem_bag("high")
    bag_speed = select_4stem_bag("fast")
    drum_model = resolve_stem_model("drums", "quality")
    bass_model = resolve_stem_model("bass", "quality")
    other_model = (
        resolve_stem_model("other", "quality") if bag_quality == "kuielab_b" else None
    )

    mdx_4_ready = (
        bag_quality == "kuielab_b"
        and all(m is not None for m in (drum_model, bass_model, other_model))
        and resolve_stem_model("vocals", "quality") is not None
    ) or (
        bag_quality == "uvr"
        and quality_vocal is not None
        and drum_model is not None
        and bass_model is not None
    )

    modes = {
        "2_stem_speed": {
            "ready": fast_vocal is not None,
            "required_models": ["UVR_MDXNET_3_9662.onnx"],
            "resolved_models": [fast_vocal.name] if fast_vocal is not None else [],
            "missing_models": [] if fast_vocal is not None else ["UVR_MDXNET_3_9662.onnx"],
        },
        "2_stem_quality": {
            "ready": quality_vocal is not None,
            "required_models": ["UVR_MDXNET_KARA.onnx"],
            "resolved_models": [quality_vocal.name] if quality_vocal is not None else [],
            "missing_models": [] if quality_vocal is not None else ["UVR_MDXNET_KARA.onnx"],
        },
        "4_stem_speed": {
            "ready": (
                bag_speed == "kuielab_b"
                and all(
                    resolve_stem_model(t, "fast") is not None
                    for t in ("vocals", "drums", "bass", "other")
                )
            )
            or (
                bag_speed == "uvr"
                and fast_vocal is not None
                and resolve_stem_model("drums", "fast") is not None
                and resolve_stem_model("bass", "fast") is not None
            ),
            "four_stem_bag": bag_speed,
            "required_models": (
                list(_KUIELAB_B_BAG.values())
                if bag_speed == "kuielab_b"
                else [
                    "UVR_MDXNET_3_9662.onnx",
                    "UVR-MDX-NET-Drum.onnx",
                    "UVR-MDX-NET-Bass.onnx",
                ]
            ),
            "resolved_models": [
                m.name
                for m in (
                    resolve_stem_model("vocals", "fast"),
                    resolve_stem_model("drums", "fast"),
                    resolve_stem_model("bass", "fast"),
                    resolve_stem_model("other", "fast")
                    if bag_speed == "kuielab_b"
                    else None,
                )
                if m is not None
            ],
            "missing_models": [],
        },
        "4_stem_quality": {
            "ready": mdx_4_ready,
            "four_stem_bag": bag_quality,
            "required_models": (
                list(_KUIELAB_B_BAG.values())
                if bag_quality == "kuielab_b"
                else [
                    "UVR_MDXNET_KARA.onnx",
                    "UVR-MDX-NET-Drum.onnx",
                    "UVR-MDX-NET-Bass.onnx",
                ]
            ),
            "resolved_models": [
                m.name
                for m in (
                    resolve_stem_model("vocals", "quality"),
                    drum_model,
                    bass_model,
                    other_model,
                )
                if m is not None
            ],
            "missing_models": [],
        },
    }
    for mode_key, bag, tier in (
        ("4_stem_speed", bag_speed, "fast"),
        ("4_stem_quality", bag_quality, "quality"),
    ):
        if bag is None:
            modes[mode_key]["ready"] = False
            modes[mode_key]["missing_models"] = modes[mode_key]["required_models"]
            continue
        if bag == "kuielab_b":
            missing = [
                _KUIELAB_B_BAG[t]
                for t in ("vocals", "drums", "bass", "other")
                if resolve_stem_model(t, tier) is None
            ]
        else:
            vocal_logical = (
                "UVR_MDXNET_3_9662.onnx"
                if tier == "fast"
                else "UVR_MDXNET_KARA.onnx"
            )
            missing = [
                name
                for name, ok in (
                    (vocal_logical, resolve_stem_model("vocals", tier) is not None),
                    (
                        "UVR-MDX-NET-Drum.onnx",
                        resolve_stem_model("drums", tier) is not None,
                    ),
                    (
                        "UVR-MDX-NET-Bass.onnx",
                        resolve_stem_model("bass", tier) is not None,
                    ),
                )
                if not ok
            ]
        modes[mode_key]["missing_models"] = missing
    return {
        "all_ready": all(mode["ready"] for mode in modes.values()),
        "supported_modes": modes,
    }


def _run_queued_job(job: dict) -> None:
    """Dispatch a queued heavy job through the canonical worker surface."""
    job_type = job.get("job_type", "split")
    if job_type == "expand":
        _run_expand_sync(
            job["job_id"],
            job["source_job_id"],
            job["out_dir"],
            job["prefer_speed"],
            job.get("quality_mode", "quality"),
            job["correlation_id"],
        )
        return

    _run_separation_sync(
        job["job_id"],
        job["input_path"],
        job["out_dir"],
        job["stem_count"],
        job["prefer_speed"],
        job["quality_mode"],
        job["correlation_id"],
        job.get("intent"),
    )


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

from stem_service.internal_auth import (
    require_configured_api_token,
    validate_service_token_at_startup,
)

STEM_SERVICE_API_TOKEN = os.environ.get("STEM_SERVICE_API_TOKEN", "")
validate_service_token_at_startup("STEM_SERVICE_API_TOKEN", STEM_SERVICE_API_TOKEN)

FRONTEND_ORIGINS = os.environ.get(
    "FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")


# ── Auth helper ──────────────────────────────────────────────────────────────

def _require_stem_service_api_token(request: Request) -> None:
    """Protect stem_service routes when it is reachable outside the trusted network."""
    require_configured_api_token(
        STEM_SERVICE_API_TOKEN,
        request.headers.get("X-Stem-Service-Token"),
    )


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
    log_cpu_budget(logger)

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
        logger.info("ONNX Stage 1 not available; deterministic 2-stem will fail until models are installed")

    path_kind, stage1_models = get_2stem_stage1_preview()
    logger.info(
        "2-stem Stage 1 preview: path=%s models=%s",
        path_kind,
        stage1_models,
    )
    mode_health = _supported_mode_health_snapshot()
    for mode_name, details in mode_health["supported_modes"].items():
        logger.info(
            "Supported mode readiness: %s ready=%s resolved=%s missing=%s",
            mode_name,
            details["ready"],
            details["resolved_models"],
            details["missing_models"],
        )
    if not mode_health["all_ready"]:
        missing_summary = "; ".join(
            f"{mode_name}: {', '.join(details['missing_models'])}"
            for mode_name, details in mode_health["supported_modes"].items()
            if details["missing_models"]
        )
        if stem_allow_missing_htdemucs_at_startup():
            logger.warning(
                "Starting with incomplete deterministic mode matrix because STEM_ALLOW_MISSING_HTDEMUCS is set: %s",
                missing_summary,
            )
        else:
            raise RuntimeError(
                "Deterministic CPU mode matrix is incomplete. Missing required models: "
                f"{missing_summary}"
            )

    logger.info(f"CORS allowed origins: {FRONTEND_ORIGINS}")
    logger.info("4-stem runtime path: deterministic %s", FOUR_STEM_BACKEND)

    # Start the split job queue workers
    await start_split_workers(_run_queued_job)
    if DEMUCS_EXECUTION_MODE in ("rpc", "hybrid"):
        ensure_rpc_server_started()

    def graceful_shutdown(signal_name):
        logger.info(f"Received {signal_name}, initiating graceful shutdown...")
        cancel_all_running_jobs()
        logger.info("Running jobs marked for cancellation")

    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda s, f, name=sig.name: graceful_shutdown(name))

    yield

    logger.info("Shutting down stem service...")
    await stop_split_workers()
    stop_rpc_server()


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
    intent: str | None = Form(None),
    task: str | None = Form(None),
    targets: str | None = Form(None),
    mode: str | None = Form(None),
) -> dict:
    """
    Start stem separation. Returns 202 with job_id. Separation runs in background.
    Poll GET /status/{job_id} for progress and stems when completed.

    quality options:
    - "speed": fast runtime path
    - "quality": higher-quality runtime path
    """
    _require_stem_service_api_token(request)

    from stem_service.routing.schema import parse_intent_form

    parsed_intent = None
    try:
        parsed_intent = parse_intent_form(
            intent_json=intent,
            task=task,
            targets_csv=targets,
            mode=mode,
            quality=quality,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    stems_str = (stems or "").strip()
    if parsed_intent is None:
        if stems_str not in ("2", "4"):
            raise HTTPException(
                status_code=400, detail="Invalid stems value. Must be '2' or '4'."
            )
        stem_count = int(stems_str)
        quality_lower = (quality or "").strip().lower()
        prefer_speed = quality_lower == "speed"
        quality_mode = "speed" if prefer_speed else "quality"
        intent_payload = None
    else:
        stem_count = parsed_intent.legacy_stem_count()
        if parsed_intent.task != "full_separation":
            stem_count = len(parsed_intent.output_stem_ids())
        prefer_speed = parsed_intent.prefer_speed()
        quality_mode = parsed_intent.quality_mode()
        intent_payload = parsed_intent.to_json_dict()

    is_sample = (sample or "").strip().lower() in ("true", "1", "yes")

    logger.info(
        "Split request: stems=%s, quality=%s, sample=%s, intent=%s",
        stem_count,
        quality_mode,
        is_sample,
        intent_payload,
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
                resolve_subprocess_path(input_path),
                "-c",
                "copy",
                resolve_subprocess_path(clipped_path),
            ]
            try:
                run_subprocess(cmd, check=True, capture_output=True, text=True)
                if clipped_path.exists() and clipped_path.stat().st_size > 0:
                    input_path.unlink()
                    input_path = clipped_path
                    logger.info("Clipped input to 60s for sample mode: %s", job_id)
            except subprocess.CalledProcessError as e:
                logger.error(
                    "Failed to clip sample for job %s: %s", job_id, e.stderr
                )

    correlation_id = getattr(request.state, "correlation_id", "unknown")
    job_payload: dict = {
        "job_id": job_id,
        "input_path": input_path,
        "out_dir": out_dir,
        "stem_count": stem_count,
        "prefer_speed": prefer_speed,
        "quality_mode": quality_mode,
        "correlation_id": correlation_id,
    }
    if intent_payload is not None:
        job_payload["intent"] = intent_payload
    queue_position = await enqueue_split_job(job_payload)

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
    Queue a completed 2-stem job for canonical 4-stem expansion.
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

    # Enforce queue depth limit (same as /split) to prevent unbounded expand concurrency
    queue_condition = get_queue_condition()
    if queue_condition is not None:
        async with queue_condition:
            if len(get_queued_splits()) >= MAX_QUEUE_DEPTH:
                logger.warning(
                    "Rejecting expand request: max queue depth %d reached", MAX_QUEUE_DEPTH
                )
                raise HTTPException(
                    status_code=429,
                    detail=f"Service capacity reached. Server is currently processing its maximum depth of {MAX_QUEUE_DEPTH} connections. Please try again later.",
                )

    expand_job_id = str(uuid.uuid4())
    out_dir = OUTPUT_BASE / expand_job_id
    out_dir.mkdir(parents=True, exist_ok=True)
    correlation_id = getattr(request.state, "correlation_id", "unknown")
    queue_position = await enqueue_expand_job(
        {
            "job_type": "expand",
            "job_id": expand_job_id,
            "source_job_id": job_id,
            "out_dir": out_dir,
            "stem_count": 4,
            "prefer_speed": prefer_speed,
            "quality_mode": "speed" if prefer_speed else "quality",
            "correlation_id": correlation_id,
        }
    )
    return JSONResponse(
        content={
            "job_id": expand_job_id,
            "status": "accepted",
            "queue_position": queue_position,
        },
        status_code=202,
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
        write_progress(
            _safe_job_path(job_id),
            build_progress_payload(
                status="cancelled",
                progress=0,
                stem_count=int(data.get("stem_count", 2)),
                quality_mode=str(data.get("quality_mode", "quality")),
                job_type=str(data.get("job_type", "split")),
                extra={"message": "Job cancellation requested"},
            ),
        )
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
    mode_health = _supported_mode_health_snapshot()
    from stem_service.routing.model_bag import intent_routing_health

    demucs_metrics = summarize_demucs_metrics()
    demucs_slo = evaluate_demucs_slo(demucs_metrics)
    service_ok = mode_health["all_ready"] and demucs_slo.get("healthy", True)
    payload: dict[str, object] = {
        "status": "ok" if service_ok else "degraded",
        "runtime": get_stem_runtime_versions(),
        "four_stem_backend": FOUR_STEM_BACKEND,
        "supported_modes": mode_health["supported_modes"],
        "intent_routing": {
            "fast": intent_routing_health("fast"),
            "high": intent_routing_health("high"),
        },
        "demucs_execution": {
            "mode": DEMUCS_EXECUTION_MODE,
            "metrics": demucs_metrics,
            "slo": demucs_slo,
        },
    }
    if os.environ.get("NODE_ENV", "development").lower() != "production":
        payload["repo_root"] = str(REPO_ROOT)
    return payload


@app.get("/metrics")
async def metrics():
    """Prometheus-compatible metrics endpoint."""
    from starlette.responses import Response as StarletteResponse

    from stem_service.metrics import (
        get_metrics_text,
        set_queue_depth,
        sync_demucs_execution_metrics,
    )

    set_queue_depth(len(get_queued_splits()))
    demucs_metrics = summarize_demucs_metrics()
    demucs_slo = evaluate_demucs_slo(demucs_metrics)
    sync_demucs_execution_metrics(demucs_metrics, demucs_slo)
    return StarletteResponse(
        content=get_metrics_text(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )
