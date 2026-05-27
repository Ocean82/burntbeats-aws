"""Job metadata models used by the MIDI service."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Literal


JobType = Literal["convert", "merge", "stem_export"]


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


@dataclass
class JobMetadata:
    """In-memory representation of job state.

    This model is intentionally minimal and can be adapted later to back
    onto a database or other persistence mechanism if needed.
    """

    id: str
    type: JobType
    status: JobStatus = JobStatus.QUEUED
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    timing_policy: str = "immediate"
    error: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

