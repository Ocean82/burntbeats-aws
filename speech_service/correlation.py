"""
Correlation ID middleware for speech_service.

Reads X-Correlation-ID from incoming requests (or generates a UUID if absent),
attaches it to request state, sets it in a context var for structured logging,
and returns it in the response header.

Pattern copied from stem_service/server.py for consistency across all services.
"""

from __future__ import annotations

import contextvars
import logging
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


# ── Context var for correlation ID propagation ────────────────────────────────

CORRELATION_ID_CONTEXT_VAR: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default="unknown"
)


# ── Logging filter: injects correlation_id into every log record ──────────────

class CorrelationIdLoggingFilter(logging.Filter):
    """Attach the current correlation_id to every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = CORRELATION_ID_CONTEXT_VAR.get()  # type: ignore[attr-defined]
        return True


def install_correlation_logging_filter() -> None:
    """Install the correlation filter on the root logger (idempotent)."""
    root_logger = logging.getLogger()
    if not any(isinstance(f, CorrelationIdLoggingFilter) for f in root_logger.filters):
        root_logger.addFilter(CorrelationIdLoggingFilter())


# ── ASGI middleware ───────────────────────────────────────────────────────────

class CorrelationLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to add correlation ID to each request for structured logging."""

    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id

        token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        finally:
            CORRELATION_ID_CONTEXT_VAR.reset(token)
