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

from midi_service.config import (
    FRONTEND_ORIGINS,
    MIDI_DEVICE,
    MIDI_OUTPUT_DIR,
    MIDI_SERVICE_API_TOKEN,
)
from midi_service.correlation import (
    CorrelationLoggingMiddleware,
    install_correlation_logging_filter,
)
from midi_service.job_queue import enqueue_job, get_queue_depth, start_worker, stop_worker
from midi_service.job_utils import (
    OUTPUT_FILENAME,
    PROGRESS_FILENAME,
    safe_job_path,
    validate_audio_file,
    write_progress,
)
from midi_service.multi_track import merge_jobs_to_multitrack
from midi_service.pipeline import preload_model, run_midi_convert_sync

logger = logging.getLogger(__name__)

# Install correlation ID logging filter on root logger
install_correlation_logging_filter()

# ── Service metadata ──────────────────────────────────────────────────────────
_start_time = None
_last_job_completed_at: str | None = None
STORAGE_SENTINEL_FILENAME = ".midi-service-storage.json"

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)
ALLOWED_QUANTIZE_GRIDS = {"1/4", "1/8", "1/16", "1/32"}


def _require_api_token(request: Request) -> None:
    if not MIDI_SERVICE_API_TOKEN:
        return
    provided = request.headers.get("X-Midi-Service-Token")
    if not provided or provided != MIDI_SERVICE_API_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _probe_storage(create_if_missing: bool = False) -> dict:
    output_dir = MIDI_OUTPUT_DIR
    if create_if_missing:
        output_dir.mkdir(parents=True, exist_ok=True)

    resolved_output_dir = str(output_dir.resolve())
    if not output_dir.exists():
        return {
            "ok": False,
            "output_dir": str(output_dir),
            "resolved_output_dir": resolved_output_dir,
            "can_read": False,
            "can_write": False,
            "sentinel_filename": STORAGE_SENTINEL_FILENAME,
            "error": "MIDI output directory does not exist",
        }
    if not output_dir.is_dir():
        return {
            "ok": False,
            "output_dir": str(output_dir),
            "resolved_output_dir": resolved_output_dir,
            "can_read": False,
            "can_write": False,
            "sentinel_filename": STORAGE_SENTINEL_FILENAME,
            "error": "MIDI output path is not a directory",
        }

    can_read = os.access(output_dir, os.R_OK)
    can_write = os.access(output_dir, os.W_OK)
    if not can_write:
        return {
            "ok": False,
            "output_dir": str(output_dir),
            "resolved_output_dir": resolved_output_dir,
            "can_read": can_read,
            "can_write": can_write,
            "sentinel_filename": STORAGE_SENTINEL_FILENAME,
            "error": "midi_service cannot write to MIDI output directory",
        }

    probe_path = output_dir / f".midi-service-probe-{uuid.uuid4().hex}.tmp"
    try:
        probe_path.write_text("ok", encoding="utf-8")
    finally:
        probe_path.unlink(missing_ok=True)

    return {
        "ok": can_read and can_write,
        "output_dir": str(output_dir),
        "resolved_output_dir": resolved_output_dir,
        "can_read": can_read,
        "can_write": can_write,
        "sentinel_filename": STORAGE_SENTINEL_FILENAME,
    }


def _write_storage_sentinel(storage: dict) -> None:
    if not storage.get("ok"):
        return

    from datetime import datetime, timezone

    sentinel_path = MIDI_OUTPUT_DIR / STORAGE_SENTINEL_FILENAME
    sentinel_payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "output_dir": storage["output_dir"],
        "resolved_output_dir": storage["resolved_output_dir"],
        "service": "midi_service",
    }
    sentinel_path.write_text(json.dumps(sentinel_payload), encoding="utf-8")


def _parse_bool_option(name: str, raw: str) -> bool:
    normalized = (raw or "").strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise ValueError(f"{name} must be true or false")


def _parse_int_option(
    name: str,
    raw: str,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    try:
        value = int((raw or "").strip())
    except Exception as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    if maximum is not None and value > maximum:
        raise ValueError(f"{name} must be <= {maximum}")
    return value


def _parse_float_option(
    name: str,
    raw: str,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    try:
        value = float((raw or "").strip())
    except Exception as exc:
        raise ValueError(f"{name} must be a number") from exc
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    if maximum is not None and value > maximum:
        raise ValueError(f"{name} must be <= {maximum}")
    return value


def _parse_quantize_grid(raw: str) -> str:
    grid = (raw or "").strip()
    if grid not in ALLOWED_QUANTIZE_GRIDS:
        raise ValueError(
            "quantize_grid must be one of 1/4, 1/8, 1/16, or 1/32"
        )
    return grid


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _start_time
    import time
    _start_time = time.time()
    storage = _probe_storage(create_if_missing=True)
    if not storage["ok"]:
        raise RuntimeError(storage.get("error", "MIDI storage probe failed"))
    _write_storage_sentinel(storage)
    logger.info(
        "MIDI storage ready: output_dir=%s resolved=%s",
        storage["output_dir"],
        storage["resolved_output_dir"],
    )
    if MIDI_DEVICE != "cpu":
        logger.warning(
            "MIDI_DEVICE=%s is ignored; this service runs CPU-only inference",
            MIDI_DEVICE,
        )
    await start_worker(_run_job)
    preload_model()
    logger.info("Basic Pitch model preloaded (CPU)")
    yield
    await stop_worker()


def _run_job(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    options: dict,
) -> None:
    run_midi_convert_sync(job_id, input_path, out_dir, options)


app = FastAPI(title="MIDI Conversion Service", version="1.0.0", lifespan=lifespan)

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
    storage = _probe_storage()
    try:
        import basic_pitch

        basic_pitch_version = getattr(basic_pitch, "__version__", "unknown")
    except ModuleNotFoundError:
        basic_pitch_version = "unavailable"

    from midi_service import __version__

    uptime = int(time.time() - _start_time) if _start_time else 0
    return {
        "status": "ok" if storage["ok"] else "degraded",
        "version": __version__,
        "uptime_seconds": uptime,
        "queue_depth": get_queue_depth(),
        "basic_pitch_version": basic_pitch_version,
        "last_job_completed_at": _last_job_completed_at,
        "storage": storage,
        "auth": {"token_required": bool(MIDI_SERVICE_API_TOKEN)},
    }


@app.get("/metrics")
async def metrics():
    """Prometheus-compatible metrics endpoint."""
    from starlette.responses import Response as StarletteResponse

    from midi_service.metrics import get_metrics_text, set_queue_depth

    set_queue_depth(get_queue_depth())
    return StarletteResponse(
        content=get_metrics_text(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@app.post("/convert")
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

    try:
        options = {
            "min_confidence": _parse_float_option(
                "min_confidence", min_confidence, minimum=0.05, maximum=0.95
            ),
            "min_note_length_ms": _parse_int_option(
                "min_note_length_ms", min_note_length_ms, minimum=10, maximum=500
            ),
            "include_pitch_bends": _parse_bool_option(
                "include_pitch_bends", include_pitch_bends
            ),
            "quantize": _parse_bool_option("quantize", quantize),
            "quantize_grid": _parse_quantize_grid(quantize_grid),
            "quantize_bpm": _parse_int_option(
                "quantize_bpm", quantize_bpm, minimum=40, maximum=300
            ),
            "quantize_strength": _parse_float_option(
                "quantize_strength", quantize_strength, minimum=0.0, maximum=1.0
            ),
            "normalize_velocity": _parse_bool_option(
                "normalize_velocity", normalize_velocity
            ),
            "target_velocity": _parse_int_option(
                "target_velocity", target_velocity, minimum=1, maximum=127
            ),
            "max_note_length_ms": _parse_int_option(
                "max_note_length_ms", max_note_length_ms, minimum=0, maximum=60_000
            ),
            "transpose": _parse_int_option(
                "transpose", transpose, minimum=-48, maximum=48
            ),
            "stem_job_id": stem_job_id or None,
            "stem_name": stem_name or None,
            "user_id": user_id or None,
        }
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
            {
                "job_id": job_id,
                "out_dir": out_dir,
                "input_path": str(input_path),
                "min_confidence": options["min_confidence"],
                "min_note_length_ms": options["min_note_length_ms"],
                "include_pitch_bends": options["include_pitch_bends"],
                "quantize": options["quantize"],
                "quantize_grid": options["quantize_grid"],
                "quantize_bpm": options["quantize_bpm"],
                "quantize_strength": options["quantize_strength"],
                "normalize_velocity": options["normalize_velocity"],
                "target_velocity": options["target_velocity"],
                "max_note_length_ms": options["max_note_length_ms"],
                "transpose": options["transpose"],
                "stem_job_id": options["stem_job_id"],
                "stem_name": options["stem_name"],
                "user_id": options["user_id"],
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

    return FileResponse(path, media_type="audio/midi", filename=filename)


@app.post("/merge")
async def merge_tracks(request: Request) -> FileResponse:
    """
    Merge multiple completed conversion jobs into a single multi-track MIDI file.

    Expects JSON body:
    {
      "jobs": [
        {"job_id": "...", "stem_name": "vocals", "program": 52, "transpose": 0, "is_drum": false},
        {"job_id": "...", "stem_name": "bass", "program": 33, "transpose": 0},
        ...
      ],
      "bpm": 120
    }
    """
    _require_api_token(request)

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    job_specs = body.get("jobs", [])
    if not job_specs or not isinstance(job_specs, list):
        raise HTTPException(status_code=400, detail="'jobs' must be a non-empty array")
    if len(job_specs) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 tracks per merge")

    bpm = int(body.get("bpm", 120))
    bpm = max(40, min(300, bpm))

    # Collect notes from each completed job's progress.json
    merge_input: list[dict] = []
    for spec in job_specs:
        job_id = spec.get("job_id", "")
        if not UUID_REGEX.match(job_id):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid job_id: {job_id}",
            )

        progress_path = safe_job_path(job_id, PROGRESS_FILENAME)
        if not progress_path.is_file():
            raise HTTPException(
                status_code=404,
                detail=f"Job not found: {job_id}",
            )

        progress_data = json.loads(progress_path.read_text(encoding="utf-8"))
        if progress_data.get("status") != "completed":
            raise HTTPException(
                status_code=400,
                detail=f"Job not completed: {job_id}",
            )

        notes = progress_data.get("result", {}).get("piano_roll_notes", [])
        merge_input.append({
            "stem_name": spec.get("stem_name", f"Track {len(merge_input) + 1}"),
            "notes": notes,
            "program": int(spec.get("program", -1)),
            "transpose": int(spec.get("transpose", 0)),
            "is_drum": bool(spec.get("is_drum", False)),
        })

        # If program is -1, let multi_track.py auto-suggest from stem_name
        if merge_input[-1]["program"] < 0:
            from midi_service.multi_track import suggest_program
            merge_input[-1]["program"] = suggest_program(
                merge_input[-1]["stem_name"]
            )

    # Write merged file to a temporary location
    merge_id = str(uuid.uuid4())
    merge_dir = MIDI_OUTPUT_DIR / merge_id
    merge_dir.mkdir(parents=True, exist_ok=True)
    output_path = merge_dir / "multitrack.mid"

    result = merge_jobs_to_multitrack(merge_input, output_path, bpm=bpm)
    logger.info(
        "Multi-track merge complete: %d tracks, %d notes, %.1fs",
        result["track_count"],
        result["total_notes"],
        result["duration_seconds"],
    )

    return FileResponse(
        output_path,
        media_type="audio/midi",
        filename="multitrack.mid",
        headers={"X-Merge-Tracks": str(result["track_count"])},
    )
