"""
Job queue management for stem separation: queuing, cancellation, worker loop.
Provides a bounded async queue with configurable concurrency.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any

from stem_service.job_utils import write_progress

logger = logging.getLogger(__name__)


class JobCancelledError(Exception):
    """Raised inside progress callbacks to signal job cancellation."""


# Job tracking for cancellation
_running_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()

# Queue split jobs so only one heavy split runs at a time.
_queued_splits: deque[dict[str, Any]] = deque()
_queue_condition: asyncio.Condition | None = None
_split_worker_tasks: list[asyncio.Task[Any]] = []


def get_queue_condition() -> asyncio.Condition | None:
    """Return the queue condition (None before lifespan init)."""
    return _queue_condition


def get_queued_splits() -> deque[dict[str, Any]]:
    """Return the queue deque (for length checks)."""
    return _queued_splits


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
    for idx, item in enumerate(_queued_splits):
        if item.get("job_id") == job_id:
            return idx + 1
    return None


def _refresh_queue_progress_locked() -> None:
    """Update progress.json for all queued jobs with their current position."""
    for idx, item in enumerate(_queued_splits):
        out_dir: Path = item["out_dir"]
        quality_mode: str = item["quality_mode"]
        write_progress(
            out_dir,
            {
                "status": "queued",
                "progress": 0,
                "quality": quality_mode,
                "queue_position": idx + 1,
            },
        )


async def enqueue_split_job(job: dict[str, Any]) -> int:
    """Add a job to the split queue. Returns the 1-based queue position."""
    if _queue_condition is None:
        raise RuntimeError("Split queue not initialized")
    async with _queue_condition:
        _queued_splits.append(job)
        _refresh_queue_progress_locked()
        pos = queued_position(job["job_id"]) or len(_queued_splits)
        _queue_condition.notify()
        return pos


async def cancel_queued_job(job_id: str, output_base: Path) -> bool:
    """Remove a queued (not yet running) job. Returns True if found and removed."""
    if _queue_condition is None:
        return False
    async with _queue_condition:
        before = len(_queued_splits)
        kept = deque([j for j in _queued_splits if j.get("job_id") != job_id])
        if len(kept) != before:
            _queued_splits.clear()
            _queued_splits.extend(kept)
            _refresh_queue_progress_locked()
            write_progress(
                output_base / job_id, {"status": "cancelled", "progress": 0}
            )
            logger.info("Queued job %s cancelled by user", job_id)
            return True
    return False


def split_worker_count() -> int:
    """Return configured concurrency for split workers."""
    raw = (os.environ.get("SPLIT_MAX_CONCURRENCY") or "1").strip()
    try:
        parsed = int(raw)
    except ValueError:
        return 1
    return max(1, parsed)


async def start_split_workers(run_separation_fn) -> None:
    """Initialize the queue condition and start worker tasks.

    Args:
        run_separation_fn: The blocking separation function to call for each job.
            Signature: (job_id, input_path, out_dir, stem_count, prefer_speed, quality_mode, correlation_id) -> None
    """
    global _queue_condition, _split_worker_tasks
    _queue_condition = asyncio.Condition()
    worker_count = split_worker_count()

    async def _worker_loop() -> None:
        if _queue_condition is None:
            return
        while True:
            async with _queue_condition:
                while not _queued_splits:
                    await _queue_condition.wait()
                job = _queued_splits.popleft()
                _refresh_queue_progress_locked()

            out_dir: Path = job["out_dir"]
            write_progress(
                out_dir,
                {
                    "status": "running",
                    "progress": 0,
                    "quality": job["quality_mode"],
                },
            )
            await asyncio.to_thread(
                run_separation_fn,
                job["job_id"],
                job["input_path"],
                job["out_dir"],
                job["stem_count"],
                job["prefer_speed"],
                job["quality_mode"],
                job["correlation_id"],
            )

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
