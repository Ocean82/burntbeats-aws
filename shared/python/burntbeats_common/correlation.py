from __future__ import annotations

import contextvars
import logging
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


CORRELATION_ID_CONTEXT_VAR: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default="unknown"
)


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
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        finally:
            CORRELATION_ID_CONTEXT_VAR.reset(token)
