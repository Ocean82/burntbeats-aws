"""
Job queue management for heavy stem jobs: queuing, cancellation, worker loop.
Provides a bounded async queue with configurable concurrency.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any

from stem_service.config import cpu_worker_concurrency
from stem_service.job_utils import build_progress_payload, write_progress

logger = logging.getLogger(__name__)


class JobCancelledError(Exception):
    """Raised inside progress callbacks to signal job cancellation."""


# Job tracking for cancellation
_running_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()

# Queue heavy jobs so one concurrency gate owns split + expand CPU work.
_queued_jobs: deque[dict[str, Any]] = deque()
_queue_condition: asyncio.Condition | None = None
_split_worker_tasks: list[asyncio.Task[Any]] = []


def get_queue_condition() -> asyncio.Condition | None:
    """Return the queue condition (None before lifespan init)."""
    return _queue_condition


def get_queued_splits() -> deque[dict[str, Any]]:
    """Return the heavy-job queue deque (legacy name kept for callers/tests)."""
    return _queued_jobs


def register_running_job(job_id: str) -> None:
    """Register a job as running (thread-safe)."""
    with _jobs_lock:
        _running_jobs[job_id] = {
            "cancelled": False,
            "started_at": time.time(),
        }


def unregister_running_job(job_id: str) -> None:
    """Remove a job from the running set (thread-safe)."""
    with _jobs_lock:
        _running_jobs.pop(job_id, None)


def is_job_cancelled(job_id: str) -> bool:
    """Check if a job has been cancelled. Thread-safe."""
    with _jobs_lock:
        job = _running_jobs.get(job_id)
        return job is not None and job.get("cancelled", False)


def cancel_job(job_id: str) -> bool:
    """Mark a job as cancelled. Thread-safe. Returns True if job was found."""
    with _jobs_lock:
        if job_id in _running_jobs:
            _running_jobs[job_id]["cancelled"] = True
            logger.info("Job %s marked for cancellation", job_id)
            return True
    return False


def cancel_all_running_jobs() -> None:
    """Mark all running jobs as cancelled (used during graceful shutdown)."""
    for job_id in list(_running_jobs.keys()):
        cancel_job(job_id)


def queued_position(job_id: str) -> int | None:
    """Return 1-based queue position for a job, or None if not queued."""
    for idx, item in enumerate(_queued_jobs):
        if item.get("job_id") == job_id:
            return idx + 1
    return None


def _refresh_queue_progress_locked() -> None:
    """Update progress.json for all queued jobs with their current position."""
    for idx, item in enumerate(_queued_jobs):
        out_dir: Path = item["out_dir"]
        quality_mode: str = item.get("quality_mode", "quality")
        write_progress(
            out_dir,
            build_progress_payload(
                status="queued",
                progress=0,
                stem_count=int(item.get("stem_count", 2)),
                quality_mode=quality_mode,
                job_type=item.get("job_type", "split"),
                queue_position=idx + 1,
                intent=item.get("intent"),
            ),
        )


async def enqueue_heavy_job(job: dict[str, Any]) -> int:
    """Add a heavy split/expand job to the shared queue."""
    if _queue_condition is None:
        raise RuntimeError("Split queue not initialized")
    async with _queue_condition:
        _queued_jobs.append(job)
        _refresh_queue_progress_locked()
        pos = queued_position(job["job_id"]) or len(_queued_jobs)
        _queue_condition.notify()
        return pos


async def enqueue_split_job(job: dict[str, Any]) -> int:
    """Legacy wrapper for split jobs on the shared heavy-job queue."""
    if "job_type" not in job:
        job = {**job, "job_type": "split"}
    return await enqueue_heavy_job(job)


async def enqueue_expand_job(job: dict[str, Any]) -> int:
    """Add an expand job to the shared heavy-job queue."""
    if "job_type" not in job:
        job = {**job, "job_type": "expand"}
    return await enqueue_heavy_job(job)


async def cancel_queued_job(job_id: str, output_base: Path) -> bool:
    """Remove a queued (not yet running) job. Returns True if found and removed."""
    if _queue_condition is None:
        return False
    async with _queue_condition:
        before = len(_queued_jobs)
        removed_job = next((j for j in _queued_jobs if j.get("job_id") == job_id), None)
        kept = deque([j for j in _queued_jobs if j.get("job_id") != job_id])
        if len(kept) != before:
            _queued_jobs.clear()
            _queued_jobs.extend(kept)
            _refresh_queue_progress_locked()
            write_progress(
                output_base / job_id,
                build_progress_payload(
                    status="cancelled",
                    progress=0,
                    stem_count=int((removed_job or {}).get("stem_count", 2)),
                    quality_mode=(removed_job or {}).get("quality_mode", "quality"),
                    job_type=(removed_job or {}).get("job_type", "split"),
                ),
            )
            logger.info("Queued job %s cancelled by user", job_id)
            return True
    return False


def split_worker_count() -> int:
    """Return configured concurrency for split workers."""
    return cpu_worker_concurrency()


async def start_split_workers(run_job_fn) -> None:
    """Initialize the queue condition and start worker tasks.

    Args:
        run_job_fn: Blocking function that accepts a queued job dict and executes it.
    """
    global _queue_condition, _split_worker_tasks
    _queue_condition = asyncio.Condition()
    worker_count = split_worker_count()

    async def _worker_loop() -> None:
        if _queue_condition is None:
            return
        while True:
            async with _queue_condition:
                while not _queued_jobs:
                    await _queue_condition.wait()
                job = _queued_jobs.popleft()
                _refresh_queue_progress_locked()

            out_dir: Path = job["out_dir"]
            write_progress(
                out_dir,
                build_progress_payload(
                    status="running",
                    progress=0,
                    stem_count=int(job.get("stem_count", 2)),
                    quality_mode=job.get("quality_mode", "quality"),
                    job_type=job.get("job_type", "split"),
                    intent=job.get("intent"),
                ),
            )
            await asyncio.to_thread(run_job_fn, job)

    _split_worker_tasks = [
        asyncio.create_task(_worker_loop(), name=f"split-worker-{idx + 1}")
        for idx in range(worker_count)
    ]
    logger.info("Split queue workers started: count=%d", worker_count)


async def stop_split_workers() -> None:
    """Cancel all worker tasks (called during shutdown)."""
    global _split_worker_tasks
    for task in _split_worker_tasks:
        task.cancel()
    for task in _split_worker_tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    _split_worker_tasks = []
