from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
from midi_service.pipeline import preload_model, run_midi_convert_sync
from midi_service.export.model import parse_export_request
from midi_service.routes.convert import build_convert_router
from midi_service.routes.jobs import build_jobs_router
from midi_service.routes.merge import build_merge_router
from midi_service.routes.waveform import build_waveform_router
from midi_service.routes.export import build_export_router
from midi_service.routes.ops import build_ops_router
from midi_service.services.export import run_export_sync
from midi_service.services.storage import probe_storage, write_storage_sentinel

logger = logging.getLogger(__name__)

install_correlation_logging_filter()


def _run_job(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    options: dict,
) -> None:
    if options.get("job_kind") == "export":
        export_request = parse_export_request(options.get("export_request") or {})
        run_export_sync(
            job_id=job_id,
            out_dir=out_dir,
            request=export_request,
            output_dir=MIDI_OUTPUT_DIR,
        )
        return
    run_midi_convert_sync(job_id, input_path, out_dir, options)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import time

    app.state.start_time = time.time()
    app.state.last_job_completed_at = None
    storage = probe_storage(app.state.midi_output_dir, create_if_missing=True)
    if not storage["ok"]:
        raise RuntimeError(storage.get("error", "MIDI storage probe failed"))
    write_storage_sentinel(app.state.midi_output_dir, storage)
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


def create_app() -> FastAPI:
    app = FastAPI(title="MIDI Conversion Service", version="1.0.0", lifespan=lifespan)
    app.state.start_time = None
    app.state.last_job_completed_at = None
    app.state.midi_output_dir = MIDI_OUTPUT_DIR
    app.state.midi_service_api_token = MIDI_SERVICE_API_TOKEN

    app.add_middleware(CorrelationLoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=FRONTEND_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(build_ops_router(get_queue_depth))
    app.include_router(
        build_convert_router(
            enqueue_job=enqueue_job,
            get_queue_depth=get_queue_depth,
        )
    )
    app.include_router(build_jobs_router())
    app.include_router(build_merge_router())
    app.include_router(build_waveform_router())
    app.include_router(
        build_export_router(
            enqueue_job=enqueue_job,
            get_queue_depth=get_queue_depth,
        )
    )
    return app


app = create_app()
