from __future__ import annotations

from typing import Callable

from fastapi import APIRouter, Request
from starlette.responses import Response as StarletteResponse

from midi_service.services.storage import probe_storage

from midi_service.job_queue import get_last_job_completed_at

from .common import get_output_dir


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
        return {
            "status": "ok" if storage["ok"] else "degraded",
            "version": __version__,
            "uptime_seconds": uptime,
            "queue_depth": get_queue_depth(),
            "basic_pitch_version": basic_pitch_version,
            "last_job_completed_at": getattr(
                request.app.state, "last_job_completed_at", None
            )
            or get_last_job_completed_at(),
            "storage": storage,
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

    return router
