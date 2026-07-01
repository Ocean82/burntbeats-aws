from __future__ import annotations

from typing import Callable

from fastapi import APIRouter, Request
from starlette.responses import Response as StarletteResponse

from midi_service.services.storage import probe_storage

from midi_service.job_queue import get_last_job_completed_at

from midi_service.config import DEFAULT_SOUNDFONT, SOUNDFONT_DIR
from midi_service.services.render import resolve_soundfont

from .common import get_output_dir, require_api_token


def build_ops_router(get_queue_depth: Callable[[], int]) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    async def health(request: Request) -> dict:
        import time

        storage = probe_storage(get_output_dir(request))
        try:
            import basic_pitch

            basic_pitch_version = getattr(basic_pitch, "__version__", "unknown")
        except ModuleNotFoundError:
            basic_pitch_version = "unavailable"

        from midi_service import __version__

        start_time = getattr(request.app.state, "start_time", None)
        uptime = int(time.time() - start_time) if start_time else 0

        soundfont_status: dict = {
            "default": DEFAULT_SOUNDFONT,
            "dir": str(SOUNDFONT_DIR),
            "available": False,
            "error": None,
        }
        try:
            resolved = resolve_soundfont(DEFAULT_SOUNDFONT)
            soundfont_status["available"] = True
            soundfont_status["resolved"] = resolved.name
        except ValueError as exc:
            soundfont_status["error"] = str(exc)

        return {
            "status": "ok" if storage["ok"] and soundfont_status["available"] else "degraded",
            "version": __version__,
            "uptime_seconds": uptime,
            "queue_depth": get_queue_depth(),
            "basic_pitch_version": basic_pitch_version,
            "last_job_completed_at": getattr(
                request.app.state, "last_job_completed_at", None
            )
            or get_last_job_completed_at(),
            "storage": storage,
            "soundfont": soundfont_status,
            "auth": {
                "token_required": bool(
                    getattr(request.app.state, "midi_service_api_token", "")
                )
            },
        }

    @router.get("/metrics")
    async def metrics():
        """Prometheus-compatible metrics endpoint."""
        from midi_service.metrics import get_metrics_text, set_queue_depth

        set_queue_depth(get_queue_depth())
        return StarletteResponse(
            content=get_metrics_text(),
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    @router.get("/soundfonts")
    async def list_soundfonts(request: Request) -> dict:
        """List available .sf2/.sf3 files for MIDI-to-audio rendering."""
        require_api_token(request)
        fonts: list[dict[str, str]] = []
        if SOUNDFONT_DIR.is_dir():
            for pattern in ("*.sf2", "*.sf3"):
                for path in sorted(SOUNDFONT_DIR.glob(pattern)):
                    if path.is_file():
                        fonts.append({"name": path.name})
        default_available = False
        default_error: str | None = None
        try:
            resolve_soundfont(DEFAULT_SOUNDFONT)
            default_available = True
        except ValueError as exc:
            default_error = str(exc)
        return {
            "default": DEFAULT_SOUNDFONT,
            "default_available": default_available,
            "default_error": default_error,
            "soundfonts": fonts,
        }

    return router
