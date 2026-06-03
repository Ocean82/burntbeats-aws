"""Shared internal service API token policy for stem/speech/midi workers."""

from __future__ import annotations

import os
import sys

TOKEN_MIN_LENGTH = 16


def is_internal_service_auth_required() -> bool:
    explicit = os.environ.get("INTERNAL_SERVICE_AUTH_REQUIRED")
    if explicit is not None and explicit.strip() != "":
        return explicit.strip().lower() in ("1", "true", "yes")
    if os.environ.get("NODE_ENV", "").strip().lower() == "production":
        return True
    return os.environ.get("SENTRY_ENVIRONMENT", "").strip().lower() == "production"


def is_valid_service_api_token(token: str) -> bool:
    return bool(token) and len(token) >= TOKEN_MIN_LENGTH


def validate_service_token_at_startup(env_name: str, token: str) -> None:
    if not is_internal_service_auth_required():
        return
    if not is_valid_service_api_token(token):
        print(
            f"FATAL: {env_name} is required (min {TOKEN_MIN_LENGTH} chars) "
            "when internal service auth is enabled",
            file=sys.stderr,
        )
        sys.exit(1)


def require_configured_api_token(configured_token: str, provided: str | None) -> None:
    if is_internal_service_auth_required():
        if not is_valid_service_api_token(configured_token):
            raise RuntimeError("Service API token missing despite startup validation")
        if not provided or provided != configured_token:
            from fastapi import HTTPException

            raise HTTPException(status_code=401, detail="Unauthorized")
        return
    if not configured_token:
        return
    if not provided or provided != configured_token:
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Unauthorized")
