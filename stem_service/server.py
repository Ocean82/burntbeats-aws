"""
FastAPI server for stem separation. Accepts POST with audio file and stems=2|4.
Returns 202 with job_id; separation runs in background. Progress in progress.json per job.
GET /status/{job_id} returns current progress/stems/error.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from stem_service.config import REPO_ROOT, STEM_BACKEND, htdemucs_available
from stem_service.hybrid import run_hybrid_2stem, run_hybrid_4stem
from stem_service.mdx_onnx import get_available_vocal_onnx
from stem_service.split import copy_stems_to_flat_dir, run_demucs

logger = logging.getLogger(__name__)

UUID_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate required models at startup so first request fails fast instead of hanging."""
    if not htdemucs_available():
        raise RuntimeError(
            "Demucs model not found: place htdemucs.pth or htdemucs.th in models/. "
            "See README or scripts/copy-models.sh."
        )
    logger.info("Model check OK: htdemucs (models/htdemucs.pth or .th)")
    onnx_path = get_available_vocal_onnx()
    if onnx_path:
        logger.info("ONNX Stage 1 available: %s", onnx_path.name)
    else:
        logger.info("ONNX Stage 1 not available; Stage 1 will use Demucs 2-stem")
    yield


app = FastAPI(title="Stem Split Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Output base: must match Node backend STEM_OUTPUT_DIR so GET /api/stems/file serves files we write here.
OUTPUT_BASE = Path(os.environ.get("STEM_OUTPUT_DIR", str(REPO_ROOT / "tmp" / "stems")))

PROGRESS_FILENAME = "progress.json"


def _write_progress(out_dir: Path, data: dict) -> None:
    (out_dir / PROGRESS_FILENAME).write_text(json.dumps(data), encoding="utf-8")


def _run_separation_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    stem_count: int,
    prefer_speed: bool,
) -> None:
    """Blocking separation; writes progress at stages. Called from thread."""
    def on_progress(pct: int) -> None:
        _write_progress(out_dir, {"status": "running", "progress": pct})

    try:
        if STEM_BACKEND == "hybrid":
            if stem_count == 2:
                stem_list = run_hybrid_2stem(
                    input_path, out_dir, prefer_speed=prefer_speed, progress_callback=on_progress
                )
            else:
                stem_list = run_hybrid_4stem(
                    input_path, out_dir, prefer_speed=prefer_speed, progress_callback=on_progress
                )
        else:
            stem_files = run_demucs(
                input_path, out_dir, stems=stem_count, prefer_speed=prefer_speed
            )
            on_progress(50)
            flat_dir = out_dir / "stems"
            stem_list = copy_stems_to_flat_dir(stem_files, flat_dir)
            on_progress(100)

        stems_payload = [
            {"id": stem_id, "path": str(p.relative_to(OUTPUT_BASE))}
            for stem_id, p in stem_list
        ]
        _write_progress(out_dir, {"status": "completed", "progress": 100, "stems": stems_payload})
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
    """
    stem_count = 4
    try:
        stem_count = int(stems)
        if stem_count not in (2, 4):
            stem_count = 4
    except ValueError:
        pass

    prefer_speed = (quality or "").strip().lower() == "speed"

    job_id = str(uuid.uuid4())
    out_dir = OUTPUT_BASE / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    input_path = out_dir / (file.filename or "input.wav")
    try:
        with open(input_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                f.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save upload: {e}") from e

    _write_progress(out_dir, {"status": "running", "progress": 0})

    async def run_in_thread() -> None:
        await asyncio.to_thread(
            _run_separation_sync,
            job_id,
            input_path,
            out_dir,
            stem_count,
            prefer_speed,
        )

    asyncio.create_task(run_in_thread())

    return JSONResponse(content={"job_id": job_id, "status": "accepted"}, status_code=202)


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


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "repo_root": str(REPO_ROOT)}
