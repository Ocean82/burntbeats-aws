"""
Job queue management for heavy stem jobs: queuing, cancellation, worker loop.
Provides a bounded async queue with configurable concurrency and an explicit
ThreadPoolExecutor that limits concurrent Demucs subprocess invocations.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

from stem_service.config import cpu_worker_concurrency
from stem_service.job_utils import build_progress_payload, write_progress

logger = logging.getLogger(__name__)


class JobCancelledError(Exception):
    """Raised inside progress callbacks to signal job cancellation."""


def split_worker_count() -> int:
    """Return configured concurrency for split workers."""
    return cpu_worker_concurrency()


class JobQueue:
    """Encapsulates job tracking, cancellation, queuing, and worker lifecycle.

    All mutable state (running jobs, queue, thread pool, worker tasks) is
    encapsulated here so callers receive a single injectable object rather
    than depending on module-level globals.
    """

    def __init__(self) -> None:
        self._running_jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._executor: ThreadPoolExecutor | None = None
        self._queue: deque[dict[str, Any]] = deque()
        self._condition: asyncio.Condition | None = None
        self._worker_tasks: list[asyncio.Task[Any]] = []

    # ── Running-job tracking (thread-safe) ──────────────────────────────

    def register_running_job(self, job_id: str) -> None:
        with self._lock:
            self._running_jobs[job_id] = {
                "cancelled": False,
                "started_at": time.time(),
            }

    def unregister_running_job(self, job_id: str) -> None:
        with self._lock:
            self._running_jobs.pop(job_id, None)

    def is_job_cancelled(self, job_id: str) -> bool:
        with self._lock:
            job = self._running_jobs.get(job_id)
            return job is not None and job.get("cancelled", False)

    def cancel_job(self, job_id: str) -> bool:
        with self._lock:
            if job_id in self._running_jobs:
                self._running_jobs[job_id]["cancelled"] = True
                logger.info("Job %s marked for cancellation", job_id)
                return True
        return False

    def cancel_all(self) -> None:
        for job_id in list(self._running_jobs.keys()):
            self.cancel_job(job_id)

    # ── Queue introspection ─────────────────────────────────────────────

    def queued_position(self, job_id: str) -> int | None:
        for idx, item in enumerate(self._queue):
            if item.get("job_id") == job_id:
                return idx + 1
        return None

    @property
    def condition(self) -> asyncio.Condition | None:
        return self._condition

    @property
    def queued_jobs(self) -> list[dict[str, Any]]:
        return list(self._queue)

    @property
    def queued_jobs_count(self) -> int:
        return len(self._queue)

    # ── Queue progress helpers ──────────────────────────────────────────

    def _write_job_progress(self, item: dict[str, Any], position: int) -> None:
        out_dir: Path = item["out_dir"]
        write_progress(
            out_dir,
            build_progress_payload(
                status="queued",
                progress=0,
                stem_count=int(item.get("stem_count", 2)),
                quality_mode=item.get("quality_mode", "quality"),
                job_type=item.get("job_type", "split"),
                queue_position=position,
                intent=item.get("intent"),
            ),
        )

    def _refresh_queue_progress(self) -> None:
        for idx, item in enumerate(self._queue):
            self._write_job_progress(item, idx + 1)

    # ── Enqueue / dequeue ───────────────────────────────────────────────

    async def enqueue_heavy_job(self, job: dict[str, Any]) -> int:
        if self._condition is None:
            raise RuntimeError("Split queue not initialized")
        async with self._condition:
            self._queue.append(job)
            pos = len(self._queue)
            self._write_job_progress(job, pos)
            self._condition.notify()
            return pos

    async def enqueue_split_job(self, job: dict[str, Any]) -> int:
        if "job_type" not in job:
            job = {**job, "job_type": "split"}
        return await self.enqueue_heavy_job(job)

    async def enqueue_expand_job(self, job: dict[str, Any]) -> int:
        if "job_type" not in job:
            job = {**job, "job_type": "expand"}
        return await self.enqueue_heavy_job(job)

    async def cancel_queued_job(self, job_id: str, output_base: Path) -> bool:
        if self._condition is None:
            return False
        async with self._condition:
            before = len(self._queue)
            removed_job = next((j for j in self._queue if j.get("job_id") == job_id), None)
            kept = deque([j for j in self._queue if j.get("job_id") != job_id])
            if len(kept) != before:
                self._queue.clear()
                self._queue.extend(kept)
                self._refresh_queue_progress()
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

    # ── Worker lifecycle ────────────────────────────────────────────────

    async def start_workers(self, run_job_fn: Callable[[dict[str, Any]], None]) -> None:
        self._condition = asyncio.Condition()
        worker_count = split_worker_count()
        self._executor = ThreadPoolExecutor(
            max_workers=worker_count,
            thread_name_prefix="demucs-worker",
        )

        async def _worker_loop() -> None:
            if self._condition is None:
                return
            loop = asyncio.get_running_loop()
            while True:
                async with self._condition:
                    while not self._queue:
                        await self._condition.wait()
                    job = self._queue.popleft()
                    self._refresh_queue_progress()

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
                await loop.run_in_executor(self._executor, run_job_fn, job)

        self._worker_tasks = [
            asyncio.create_task(_worker_loop(), name=f"split-worker-{idx + 1}")
            for idx in range(worker_count)
        ]
        logger.info("Split queue workers started: count=%d pool_max_workers=%d", worker_count, worker_count)

    async def stop_workers(self) -> None:
        for task in self._worker_tasks:
            task.cancel()
        for task in self._worker_tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._worker_tasks.clear()

        if self._executor is not None:
            self._executor.shutdown(wait=False)
            self._executor = None
