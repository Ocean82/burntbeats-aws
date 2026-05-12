"""
Sentry APM initialization for the stem service.

Provides:
- init_sentry(): Configure and start Sentry SDK with FastAPI integration.
- job_span(): Context manager that creates a Sentry span for background job tracking.
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Generator

logger = logging.getLogger(__name__)


def _before_send(event: dict, hint: dict) -> dict | None:
    """Strip X-Stem-Service-Token header from request data (case-insensitive)."""
    request_data = event.get("request")
    if request_data and isinstance(request_data.get("headers"), dict):
        headers = request_data["headers"]
        keys_to_remove = [
            k for k in headers if k.lower() == "x-stem-service-token"
        ]
        for k in keys_to_remove:
            del headers[k]
    return event


def init_sentry() -> None:
    """Initialize Sentry SDK for the stem service.

    Reads configuration from environment variables:
    - SENTRY_DSN: Required. If empty/None, initialization is skipped.
    - SENTRY_ENVIRONMENT: Defaults to "production".
    - SENTRY_RELEASE: Optional release/version tag.

    Configures FastAPI integration for automatic request tracing and
    a before_send hook to strip sensitive headers.
    """
    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        logger.info("SENTRY_DSN not set — Sentry initialization skipped")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=dsn,
            traces_sample_rate=0.3,
            send_default_pii=False,
            environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
            release=os.environ.get("SENTRY_RELEASE"),
            integrations=[FastApiIntegration()],
            before_send=_before_send,
        )
        logger.info("Sentry initialized (env=%s)", os.environ.get("SENTRY_ENVIRONMENT", "production"))
    except Exception as e:
        logger.error("Sentry initialization failed: %s", e)


@contextmanager
def job_span(job_id: str, operation: str, **tags: str | int) -> Generator[None, None, None]:
    """Context manager that creates a Sentry span with job metadata.

    Args:
        job_id: Unique identifier for the job.
        operation: Operation type (e.g., "stem_separation", "stem_expand").
        **tags: Additional span tags (e.g., stem_count, quality_mode).

    Usage:
        with job_span(job_id, "stem_separation", stem_count=4, quality_mode="quality"):
            # ... separation logic ...
    """
    try:
        import sentry_sdk

        with sentry_sdk.start_span(op=operation, name=f"job:{job_id}") as span:
            span.set_data("job_id", job_id)
            for key, value in tags.items():
                span.set_data(key, value)
            yield
    except ImportError:
        # sentry_sdk not installed — no-op
        yield
    except Exception:
        # If Sentry span creation fails, still execute the wrapped code
        yield
