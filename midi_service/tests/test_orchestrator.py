from __future__ import annotations

from pathlib import Path
from typing import Any

from midi_service.jobs.model import JobMetadata, JobStatus
from midi_service.services.orchestrator import JobOrchestrator


class DummyEnqueue:
    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    async def __call__(self, item: dict[str, Any]) -> None:  # type: ignore[override]
        self.items.append(item)


async def test_launch_job_registers_metadata_and_enqueues(tmp_path: Path) -> None:
    orchestrator = JobOrchestrator()
    enqueue = DummyEnqueue()

    input_path = tmp_path / "input.wav"
    input_path.write_bytes(b"dummy")

    metadata = await orchestrator.launch_job(
        enqueue_job=enqueue,
        job_id="job-1",
        job_type="convert",
        input_path=input_path,
        options={"foo": "bar"},
        timing_policy="immediate",
        out_dir=tmp_path,
    )

    assert metadata.id == "job-1"
    assert metadata.status == JobStatus.QUEUED
    assert enqueue.items and enqueue.items[0]["job_id"] == "job-1"


def test_status_updates_and_listing() -> None:
    orchestrator = JobOrchestrator()

    # Seed a job directly in the registry for update tests.
    jm = JobMetadata(id="job-1", type="convert")
    orchestrator._jobs["job-1"] = jm  # type: ignore[attr-defined]

    orchestrator.update_started("job-1")
    assert jm.status == JobStatus.RUNNING
    assert jm.started_at is not None

    orchestrator.update_completed("job-1")
    assert jm.status == JobStatus.COMPLETED
    assert jm.completed_at is not None

    # Add another job and cancel it.
    jm2 = JobMetadata(id="job-2", type="convert")
    orchestrator._jobs["job-2"] = jm2  # type: ignore[attr-defined]
    orchestrator.cancel("job-2")
    assert jm2.status == JobStatus.CANCELED

    all_jobs = list(orchestrator.list_jobs())
    assert {j.id for j in all_jobs} == {"job-1", "job-2"}


