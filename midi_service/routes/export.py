from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from midi_service.export.model import ExportMode, ExportRequest

from .common import require_api_token


def build_export_router() -> APIRouter:
    router = APIRouter()

    @router.post("/export")
    async def create_export(request: Request) -> JSONResponse:
        require_api_token(request)
        try:
            body: dict[str, Any] = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        try:
            req = ExportRequest(
                mode=ExportMode(body.get("mode", "stems")),
                selected_stems=list(body.get("selected_stems") or []),
                title=body.get("title"),
                artist=body.get("artist"),
                genre=body.get("genre"),
            )
        except (KeyError, ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if not req.selected_stems:
            raise HTTPException(
                status_code=400, detail="selected_stems must be a non-empty array"
            )

        # Full export orchestration is planned in later work; for now we
        # just echo back a placeholder export_id and the parsed request
        # so callers can begin wiring UI flows.
        export_id = "export-placeholder"
        return JSONResponse(
            {
                "export_id": export_id,
                "mode": req.mode.value,
                "selected_stems": req.selected_stems,
            }
        )

    return router

