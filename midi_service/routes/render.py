"""FastAPI router for MIDI-to-audio render endpoint."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, model_validator

from .common import UUID_REGEX, get_output_dir, require_api_token
from midi_service.services.render import resolve_soundfont
from midi_service.services.storage import safe_job_path, write_progress


class MidiNote(BaseModel):
    pitch: int = Field(..., ge=0, le=127)
    start: float = Field(..., ge=0)
    duration: float = Field(..., gt=0)
    velocity: int = Field(100, ge=0, le=127)
    channel: int = Field(0, ge=0, le=15)


class RenderTrack(BaseModel):
    stem_name: str | None = None
    instrument: int | None = Field(None, ge=0, le=127)
    volume: float | None = Field(None, ge=0, le=1)
    pan: int | None = Field(None, ge=0, le=127)
    channel: int | None = Field(None, ge=0, le=15)


class RenderRequest(BaseModel):
    source_job_id: str | None = None
    notes: list[MidiNote] | None = None
    bpm: float = Field(120, gt=0)
    format: Literal["wav", "mp3"] = "wav"
    sample_rate: int = Field(44100, ge=8000, le=192000)
    soundfont: str | None = None
    instrument: int | None = Field(None, ge=0, le=127)
    tracks: list[RenderTrack] = Field(default_factory=list)
    master_gain: float = Field(1.0, ge=0, le=4)
    normalize: bool = False

    @model_validator(mode="after")
    def require_source(self):
        if not self.source_job_id and not self.notes:
            raise ValueError("Either source_job_id or notes must be provided")
        if self.source_job_id and self.notes:
            raise ValueError("Provide either source_job_id or notes, not both")
        return self


def build_render_router(
    *,
    enqueue_job: Callable[[dict[str, Any]], Awaitable[None]],
    get_queue_depth: Callable[[], int],
) -> APIRouter:
    router = APIRouter()

    @router.post("/render")
    async def create_render(request: Request) -> JSONResponse:
        require_api_token(request)
        try:
            body: dict[str, Any] = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        try:
            req = RenderRequest.model_validate(body)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        # Validate soundfont exists early (fail fast)
        try:
            resolve_soundfont(req.soundfont)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        render_id = str(uuid.uuid4())
        output_dir = get_output_dir(request)
        out_dir = safe_job_path(output_dir, render_id)
        out_dir.mkdir(parents=True, exist_ok=True)

        write_progress(
            out_dir,
            {
                "status": "queued",
                "job_id": render_id,
                "progress": 0,
                "message": "Queued render job",
                "queue_depth": get_queue_depth() + 1,
                "type": "render",
            },
        )

        try:
            await enqueue_job(
                {
                    "job_id": render_id,
                    "out_dir": out_dir,
                    "input_path": str(out_dir / "render.input"),  # placeholder
                    "job_kind": "render",
                    "render_request": {
                        "source_job_id": req.source_job_id,
                        "notes": (
                            [n.model_dump() for n in req.notes] if req.notes else None
                        ),
                        "bpm": req.bpm,
                        "format": req.format,
                        "sample_rate": req.sample_rate,
                        "soundfont": req.soundfont,
                        "instrument": req.instrument,
                        "tracks": [t.model_dump() for t in req.tracks],
                        "master_gain": req.master_gain,
                        "normalize": req.normalize,
                    },
                }
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=503, detail="MIDI render queue is full"
            ) from exc

        return JSONResponse(
            status_code=202,
            content={"job_id": render_id, "status": "queued"},
        )

    @router.get("/render/status/{render_id}")
    async def render_status(request: Request, render_id: str) -> dict[str, Any]:
        require_api_token(request)
        if not UUID_REGEX.match(render_id):
            raise HTTPException(status_code=400, detail="Invalid render_id")

        output_dir = get_output_dir(request)
        progress_path = safe_job_path(output_dir, render_id, "progress.json")
        if not progress_path.is_file():
            raise HTTPException(status_code=404, detail="Render job not found")
        try:
            return json.loads(progress_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=500, detail="Progress data corrupted"
            ) from exc

    @router.get("/render/file/{render_id}/{filename}")
    async def render_file(
        request: Request, render_id: str, filename: str
    ) -> FileResponse:
        require_api_token(request)
        if not UUID_REGEX.match(render_id):
            raise HTTPException(status_code=400, detail="Invalid render_id")
        if "/" in filename or "\\" in filename or "\x00" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        ALLOWED_FILENAMES = {"render.wav", "render.mp3"}
        if filename not in ALLOWED_FILENAMES:
            raise HTTPException(status_code=400, detail="Unknown render file")

        output_dir = get_output_dir(request)
        file_path = safe_job_path(output_dir, render_id, filename)
        if not file_path.is_file():
            raise HTTPException(status_code=404, detail="Render file not ready")

        media_type = "audio/mpeg" if filename.endswith(".mp3") else "audio/wav"
        return FileResponse(file_path, media_type=media_type, filename=filename)

    return router
