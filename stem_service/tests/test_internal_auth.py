"""Tests for fail-closed internal service API token policy."""

from __future__ import annotations

import importlib

import pytest
from fastapi import HTTPException


def test_startup_exits_when_auth_required_and_token_missing(monkeypatch) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_AUTH_REQUIRED", "1")
    monkeypatch.delenv("STEM_SERVICE_API_TOKEN", raising=False)
    mod = importlib.import_module("stem_service.internal_auth")
    importlib.reload(mod)
    with pytest.raises(SystemExit):
        mod.validate_service_token_at_startup("STEM_SERVICE_API_TOKEN", "")


def test_require_token_rejects_when_configured(monkeypatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_AUTH_REQUIRED", raising=False)
    monkeypatch.setenv("NODE_ENV", "development")
    mod = importlib.import_module("stem_service.internal_auth")
    importlib.reload(mod)
    with pytest.raises(HTTPException) as exc:
        mod.require_configured_api_token("secret-token-value", "wrong")
    assert exc.value.status_code == 401


def test_require_token_allows_when_dev_and_unconfigured(monkeypatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_AUTH_REQUIRED", raising=False)
    monkeypatch.setenv("NODE_ENV", "development")
    mod = importlib.import_module("stem_service.internal_auth")
    importlib.reload(mod)
    mod.require_configured_api_token("", None)
