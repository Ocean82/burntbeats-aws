"""
Prometheus metrics for speech_service.

Exposes job duration histogram, job status counter, and queue depth gauge.
Mount the /metrics endpoint in server.py.
"""

from __future__ import annotations

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
    "speech_job_duration_seconds",
    "Duration of speech enhancement jobs in seconds",
    labelnames=["status"],
    buckets=[5, 10, 30, 60, 120, 300, 600],
    registry=REGISTRY,
)

jobs_total = Counter(
    "speech_jobs_total",
    "Total number of speech jobs by status",
    labelnames=["status"],
    registry=REGISTRY,
)

queue_depth = Gauge(
    "speech_queue_depth",
    "Current number of jobs in the speech enhancement queue",
    registry=REGISTRY,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def record_job_completed(duration_seconds: float) -> None:
    """Record a completed job's duration and increment the success counter."""
    job_duration_seconds.labels(status="completed").observe(duration_seconds)
    jobs_total.labels(status="completed").inc()


def record_job_failed() -> None:
    """Increment the failed job counter."""
    jobs_total.labels(status="failed").inc()


def set_queue_depth(depth: int) -> None:
    """Update the queue depth gauge."""
    queue_depth.set(depth)


def get_metrics_text() -> bytes:
    """Generate Prometheus text format metrics."""
    return generate_latest(REGISTRY)
