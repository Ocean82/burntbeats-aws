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

demucs_timeout_rate = Gauge(
    "stem_demucs_timeout_rate",
    "Recent Demucs job timeout rate from metrics JSONL window",
    registry=REGISTRY,
)

demucs_error_rate = Gauge(
    "stem_demucs_error_rate",
    "Recent Demucs job error rate from metrics JSONL window",
    registry=REGISTRY,
)

demucs_slo_healthy = Gauge(
    "stem_demucs_slo_healthy",
    "1 when Demucs execution SLOs are healthy, else 0",
    registry=REGISTRY,
)

demucs_route_total = Gauge(
    "stem_demucs_route_jobs",
    "Recent Demucs execution route counts from metrics JSONL window",
    labelnames=["route"],
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


def sync_demucs_execution_metrics(
    summary: dict[str, object],
    slo: dict[str, object],
) -> None:
    """Publish Demucs rollout observability gauges for Prometheus scraping."""
    demucs_timeout_rate.set(float(summary.get("timeout_rate", 0.0)))
    demucs_error_rate.set(float(summary.get("error_rate", 0.0)))
    demucs_slo_healthy.set(1.0 if slo.get("healthy") else 0.0)

    routes = summary.get("routes", {})
    if isinstance(routes, dict):
        for route_name, count in routes.items():
            demucs_route_total.labels(route=str(route_name)).set(float(count))


def get_metrics_text() -> bytes:
    """Generate Prometheus text format metrics."""
    return generate_latest(REGISTRY)
