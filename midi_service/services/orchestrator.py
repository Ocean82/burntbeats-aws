"""Job orchestration facade for midi_service.

This module provides a thin abstraction over the existing job queue so
that higher-level code and HTTP routes can work with a structured job
model instead of raw dicts.
"""

from __future__ import annotations

from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from midi_service.config import MIDI_OUTPUT_DIR
from midi_service.jobs.model import JobMetadata, JobStatus, JobType


class JobOrchestrator:
    """In-memory job registry plus wrapper around the job queue.

    This does not change how jobs are executed; it simply tracks
    metadata about jobs that are enqueued through it.
    """

    def __init__(self) -> None:
        self._jobs: "OrderedDict[str, JobMetadata]" = OrderedDict()

    # The actual enqueue function is injected so tests can use a fake.
    async def launch_job(
        self,
        enqueue_job,
        *,
        job_id: str,
        job_type: JobType,
        input_path: Path,
        options: dict[str, Any],
        timing_policy: str = "immediate",
        out_dir: Path | None = None,
    ) -> JobMetadata:
        """Register and enqueue a new job.

        Parameters
        ----------
        enqueue_job:
            Async function compatible with ``job_queue.enqueue_job``.
        job_id:
            Unique identifier for the job (UUID string).
        job_type:
            Logical job type, e.g. ``\"convert\"`` or ``\"merge\"``.
        input_path:
            Source file path.
        options:
            Job options dict; will be passed through as part of the
            queue item.
        timing_policy:
            Currently stored for future scheduling extensions.
        out_dir:
            Output directory; defaults to ``MIDI_OUTPUT_DIR``.
        """

        metadata = JobMetadata(
            id=job_id,
            type=job_type,
            status=JobStatus.QUEUED,
            timing_policy=timing_policy,
        )
        self._jobs[job_id] = metadata

        await enqueue_job(
            {
                "job_id": job_id,
                "input_path": str(input_path),
                "out_dir": out_dir or MIDI_OUTPUT_DIR,
                "job_type": job_type,
                "options": options,
            }
        )
        return metadata

    def update_started(self, job_id: str) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()

    def update_completed(self, job_id: str, *, error: str | None = None) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return
        job.completed_at = datetime.utcnow()
        if error:
            job.status = JobStatus.FAILED
            job.error = error
        else:
            job.status = JobStatus.COMPLETED

    def cancel(self, job_id: str) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return
        if job.status in {JobStatus.COMPLETED, JobStatus.FAILED}:
            return
        job.status = JobStatus.CANCELED
        job.completed_at = datetime.utcnow()

    def get_job(self, job_id: str) -> JobMetadata | None:
        return self._jobs.get(job_id)

    def list_jobs(self, status_filter: JobStatus | None = None) -> Iterable[JobMetadata]:
        if status_filter is None:
            return list(self._jobs.values())
        return [j for j in self._jobs.values() if j.status == status_filter]

