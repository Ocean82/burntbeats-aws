"""Single-worker async queue for MIDI conversion jobs."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

from midi_service.config import MAX_QUEUE_DEPTH
from midi_service.job_utils import write_progress

logger = logging.getLogger(__name__)

_queued: deque[dict[str, Any]] = deque()
_condition: asyncio.Condition | None = None
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="midi-worker")
_worker_task: asyncio.Task[Any] | None = None


def get_queue_depth() -> int:
    return len(_queued)


async def start_worker(run_fn: Callable[..., None]) -> None:
    global _condition, _worker_task
    _condition = asyncio.Condition()
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
    assert _condition is not None
    while True:
        async with _condition:
            while not _queued:
                await _condition.wait()
            item = _queued.popleft()
        out_dir: Path = item["out_dir"]
        job_id: str = item["job_id"]
        try:
            loop = asyncio.get_running_loop()
            options = {
                "min_confidence": item.get("min_confidence", 0.5),
                "min_note_length_ms": item.get("min_note_length_ms", 58),
                "include_pitch_bends": item.get("include_pitch_bends", True),
            }
            await loop.run_in_executor(
                _executor,
                run_fn,
                job_id,
                Path(item["input_path"]),
                out_dir,
                options,
            )
        except Exception as e:
            logger.exception("MIDI job %s failed", job_id)
            write_progress(
                out_dir,
                {
                    "status": "failed",
                    "job_id": job_id,
                    "error": str(e),
                },
            )
        finally:
            async with _condition:
                _condition.notify_all()
