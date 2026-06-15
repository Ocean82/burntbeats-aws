"""Single-worker async queue for MIDI conversion jobs."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from midi_service.config import MAX_QUEUE_DEPTH
from midi_service.job_options import options_from_job_item
from midi_service.job_utils import write_progress
from midi_service.metrics import record_job_completed, record_job_failed

logger = logging.getLogger(__name__)

_queued: deque[dict[str, Any]] = deque()
_condition: asyncio.Condition | None = None
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="midi-worker")
_worker_task: asyncio.Task[Any] | None = None

_running_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_last_job_completed_at: str | None = None
_on_job_completed: Callable[[], None] | None = None


class JobCancelledError(Exception):
    """Raised when a queued or running job was cancelled."""


def get_queue_depth() -> int:
    return len(_queued)


def get_last_job_completed_at() -> str | None:
    return _last_job_completed_at


def register_running_job(job_id: str) -> None:
    with _jobs_lock:
        _running_jobs[job_id] = {"cancelled": False, "started_at": time.time()}


def unregister_running_job(job_id: str) -> None:
    with _jobs_lock:
        _running_jobs.pop(job_id, None)


def is_job_cancelled(job_id: str) -> bool:
    with _jobs_lock:
        job = _running_jobs.get(job_id)
        return job is not None and job.get("cancelled", False)


def cancel_running_job(job_id: str) -> bool:
    with _jobs_lock:
        if job_id in _running_jobs:
            _running_jobs[job_id]["cancelled"] = True
            logger.info("Running MIDI job %s marked for cancellation", job_id)
            return True
    return False


async def cancel_queued_job(job_id: str, out_dir: Path) -> bool:
    if _condition is None:
        return False
    async with _condition:
        before = len(_queued)
        kept = deque([item for item in _queued if item.get("job_id") != job_id])
        if len(kept) == before:
            return False
        _queued.clear()
        _queued.extend(kept)
        write_progress(
            out_dir,
            {
                "status": "cancelled",
                "job_id": job_id,
                "progress": 0,
                "message": "Job cancelled",
            },
        )
        logger.info("Queued MIDI job %s cancelled", job_id)
        return True


async def start_worker(
    run_fn: Callable[..., None],
    *,
    on_job_completed: Callable[[], None] | None = None,
) -> None:
    global _condition, _worker_task, _on_job_completed
    _condition = asyncio.Condition()
    _on_job_completed = on_job_completed
    _worker_task = asyncio.create_task(_worker_loop(run_fn))
    logger.info("MIDI job worker started")


async def stop_worker() -> None:
    global _worker_task
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
        _worker_task = None
    _executor.shutdown(wait=False, cancel_futures=True)


async def enqueue_job(item: dict[str, Any]) -> None:
    if _condition is None:
        raise RuntimeError("MIDI worker not started")
    async with _condition:
        if len(_queued) >= MAX_QUEUE_DEPTH:
            raise RuntimeError("MIDI queue is full")
        _queued.append(item)
        _condition.notify()


async def _worker_loop(run_fn: Callable[..., None]) -> None:
    global _last_job_completed_at
    assert _condition is not None
    while True:
        async with _condition:
            while not _queued:
                await _condition.wait()
            item = _queued.popleft()
        out_dir: Path = item["out_dir"]
        job_id: str = item["job_id"]
        started = time.perf_counter()
        register_running_job(job_id)
        try:
            if is_job_cancelled(job_id):
                raise JobCancelledError("Job cancelled before start")

            loop = asyncio.get_running_loop()
            job_kind = str(item.get("job_kind") or "convert")
            if job_kind == "export":
                options = {
                    "job_kind": "export",
                    "export_request": item.get("export_request") or {},
                }
            elif job_kind == "render":
                options = {
                    "job_kind": "render",
                    "render_request": item.get("render_request") or {},
                }
            elif job_kind == "merge":
                options = {
                    "job_kind": "merge",
                    "merge_request": item.get("merge_request") or {},
                }
            else:
                options = options_from_job_item(item)
            await loop.run_in_executor(
                _executor,
                run_fn,
                job_id,
                Path(item["input_path"]),
                out_dir,
                options,
            )

            if is_job_cancelled(job_id):
                write_progress(
                    out_dir,
                    {
                        "status": "cancelled",
                        "job_id": job_id,
                        "progress": 0,
                        "message": "Job cancelled",
                    },
                )
            else:
                duration = time.perf_counter() - started
                record_job_completed(duration)
                _last_job_completed_at = datetime.now(timezone.utc).isoformat()
                if _on_job_completed:
                    _on_job_completed()
        except JobCancelledError:
            write_progress(
                out_dir,
                {
                    "status": "cancelled",
                    "job_id": job_id,
                    "progress": 0,
                    "message": "Job cancelled",
                },
            )
        except Exception as e:
            logger.exception("MIDI job %s failed", job_id)
            record_job_failed()
            write_progress(
                out_dir,
                {
                    "status": "failed",
                    "job_id": job_id,
                    "error": str(e),
                },
            )
        finally:
            unregister_running_job(job_id)
            async with _condition:
                _condition.notify_all()
