from __future__ import annotations

import contextvars
import logging
import os
import time
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


CORRELATION_ID_CONTEXT_VAR: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default="unknown"
)
SERVICE_VERSION = os.environ.get("SERVICE_VERSION") or os.environ.get("SENTRY_RELEASE") or "dev"


class CorrelationIdLoggingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = CORRELATION_ID_CONTEXT_VAR.get()
        return True


def install_correlation_logging_filter() -> None:
    root_logger = logging.getLogger()
    if not any(isinstance(f, CorrelationIdLoggingFilter) for f in root_logger.filters):
        root_logger.addFilter(CorrelationIdLoggingFilter())


class CorrelationLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id

        token = CORRELATION_ID_CONTEXT_VAR.set(correlation_id)
        started_at = time.perf_counter()
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            response.headers["X-Service-Version"] = SERVICE_VERSION
            duration_ms = (time.perf_counter() - started_at) * 1000
            logging.getLogger("request").info(
                "request_complete method=%s path=%s status=%s duration_ms=%.2f",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )
            return response
        finally:
            CORRELATION_ID_CONTEXT_VAR.reset(token)
