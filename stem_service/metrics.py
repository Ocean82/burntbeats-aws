"""
Prometheus metrics for stem_service.

Exposes job duration histogram, job status counter, and queue depth gauge.
Mount the /metrics endpoint in server.py.
"""

from __future__ import annotations

import time
from contextlib import contextmanager

from prometheus_client import (
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

# Use a dedicated registry to avoid polluting the global default.
REGISTRY = CollectorRegistry()

# ── Metrics definitions ───────────────────────────────────────────────────────

job_duration_seconds = Histogram(
    "stem_job_duration_seconds",
    "Duration of stem separation jobs in seconds",
    labelnames=["operation", "quality", "stems"],
    buckets=[5, 10, 30, 60, 120, 300, 600, 1200],
    registry=REGISTRY,
)

jobs_total = Counter(
    "stem_jobs_total",
    "Total number of stem jobs by status",
    labelnames=["status", "operation"],
    registry=REGISTRY,
)

queue_depth = Gauge(
    "stem_queue_depth",
    "Current number of jobs in the stem split queue",
    registry=REGISTRY,
)

active_jobs = Gauge(
    "stem_active_jobs",
    "Number of currently running stem jobs",
    registry=REGISTRY,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def record_job_completed(
    duration_seconds: float,
    operation: str = "split",
    quality: str = "quality",
    stems: str = "2",
) -> None:
    """Record a completed job's duration and increment the success counter."""
    job_duration_seconds.labels(
        operation=operation, quality=quality, stems=stems
    ).observe(duration_seconds)
    jobs_total.labels(status="completed", operation=operation).inc()


def record_job_failed(operation: str = "split") -> None:
    """Increment the failed job counter."""
    jobs_total.labels(status="failed", operation=operation).inc()


def record_job_cancelled(operation: str = "split") -> None:
    """Increment the cancelled job counter."""
    jobs_total.labels(status="cancelled", operation=operation).inc()


def set_queue_depth(depth: int) -> None:
    """Update the queue depth gauge."""
    queue_depth.set(depth)


@contextmanager
def track_active_job():
    """Context manager to track active job count."""
    active_jobs.inc()
    try:
        yield
    finally:
        active_jobs.dec()


def get_metrics_text() -> bytes:
    """Generate Prometheus text format metrics."""
    return generate_latest(REGISTRY)
