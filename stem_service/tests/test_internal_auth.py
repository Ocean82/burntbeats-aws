"""Tests for fail-closed internal service API token policy."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from burntbeats_common.auth import (
    require_configured_api_token,
    validate_service_token_at_startup,
)


def test_startup_exits_when_auth_required_and_token_missing(monkeypatch) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_AUTH_REQUIRED", "1")
    with pytest.raises(SystemExit):
        validate_service_token_at_startup("STEM_SERVICE_API_TOKEN", "")


def test_require_token_rejects_when_configured(monkeypatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_AUTH_REQUIRED", raising=False)
    monkeypatch.setenv("NODE_ENV", "development")
    with pytest.raises(HTTPException) as exc:
        require_configured_api_token("secret-token-value", "wrong")
    assert exc.value.status_code == 401


def test_require_token_allows_when_dev_and_unconfigured(monkeypatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_AUTH_REQUIRED", raising=False)
    monkeypatch.setenv("NODE_ENV", "development")
    require_configured_api_token("", None)
