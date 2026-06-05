"""Tests for speech_service single-worker job queue."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

import speech_service.job_queue as jq


async def _noop_run_job(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    denoise: bool,
    batch: bool,
) -> None:
    del job_id, input_path, out_dir, denoise, batch


def test_enqueue_rejects_when_queue_full(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jq, "MAX_QUEUE_DEPTH", 1)

    async def _run() -> None:
        await jq.start_worker(_noop_run_job)
        item = {
            "job_id": "job-1",
            "input_path": "/tmp/in.wav",
            "out_dir": Path("/tmp/out-1"),
            "denoise": True,
            "batch": False,
        }
        await jq.enqueue_job(item)
        with pytest.raises(RuntimeError, match="Speech queue is full"):
            await jq.enqueue_job(
                {
                    "job_id": "job-2",
                    "input_path": "/tmp/in2.wav",
                    "out_dir": Path("/tmp/out-2"),
                    "denoise": True,
                    "batch": False,
                }
            )
        await jq.stop_worker()

    asyncio.run(_run())


def test_enqueue_requires_started_worker() -> None:
    async def _run() -> None:
        with pytest.raises(RuntimeError, match="Speech worker not started"):
            await jq.enqueue_job(
                {
                    "job_id": "job-x",
                    "input_path": "/tmp/in.wav",
                    "out_dir": Path("/tmp/out"),
                }
            )

    asyncio.run(_run())


def test_get_queue_depth_empty() -> None:
    assert jq.get_queue_depth() == 0
