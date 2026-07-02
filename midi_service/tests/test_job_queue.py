from __future__ import annotations

from pathlib import Path

import pytest

from midi_service import job_queue


@pytest.fixture(autouse=True)
async def reset_worker():
    await job_queue.stop_worker()
    yield
    await job_queue.stop_worker()


@pytest.mark.asyncio
async def test_enqueue_increments_queue_depth(tmp_path: Path) -> None:
    await job_queue.start_worker(lambda *_args, **_kwargs: None)

    job_dir = tmp_path / "job-a"
    job_dir.mkdir()
    await job_queue.enqueue_job(
        {
            "job_id": "job-a",
            "out_dir": job_dir,
            "input_path": str(tmp_path / "input.wav"),
            "job_kind": "convert",
        },
    )

    assert job_queue.get_queue_depth() == 1


@pytest.mark.asyncio
async def test_cancel_queued_job_removes_item(tmp_path: Path) -> None:
    await job_queue.start_worker(lambda *_args, **_kwargs: None)

    job_dir = tmp_path / "queued-job"
    job_dir.mkdir()
    item = {
        "job_id": "queued-job",
        "out_dir": job_dir,
        "input_path": str(tmp_path / "input.wav"),
        "job_kind": "convert",
    }
    await job_queue.enqueue_job(item)
    assert job_queue.get_queue_depth() == 1

    cancelled = await job_queue.cancel_queued_job("queued-job", job_dir)
    assert cancelled is True
    assert job_queue.get_queue_depth() == 0


@pytest.mark.asyncio
async def test_enqueue_raises_when_queue_full(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(job_queue, "MAX_QUEUE_DEPTH", 1)
    await job_queue.start_worker(lambda *_args, **_kwargs: None)

    job_dir = tmp_path / "job-1"
    job_dir.mkdir()
    await job_queue.enqueue_job(
        {
            "job_id": "job-1",
            "out_dir": job_dir,
            "input_path": str(tmp_path / "a.wav"),
            "job_kind": "convert",
        },
    )

    job_dir_2 = tmp_path / "job-2"
    job_dir_2.mkdir()
    with pytest.raises(RuntimeError, match="queue is full"):
        await job_queue.enqueue_job(
            {
                "job_id": "job-2",
                "out_dir": job_dir_2,
                "input_path": str(tmp_path / "b.wav"),
                "job_kind": "convert",
            },
        )
