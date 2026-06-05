"""Tests for fail-closed internal service API token policy."""

from __future__ import annotations

import importlib

import pytest
from fastapi import HTTPException


def test_startup_exits_when_auth_required_and_token_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_AUTH_REQUIRED", "1")
    monkeypatch.delenv("SPEECH_SERVICE_API_TOKEN", raising=False)
    mod = importlib.import_module("speech_service.internal_auth")
    importlib.reload(mod)
    with pytest.raises(SystemExit):
        mod.validate_service_token_at_startup("SPEECH_SERVICE_API_TOKEN", "")


def test_require_token_rejects_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_AUTH_REQUIRED", raising=False)
    monkeypatch.setenv("NODE_ENV", "development")
    mod = importlib.import_module("speech_service.internal_auth")
    importlib.reload(mod)
    with pytest.raises(HTTPException) as exc:
        mod.require_configured_api_token("secret-token-value-ok", "wrong")
    assert exc.value.status_code == 401


def test_require_token_allows_when_dev_and_unconfigured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_AUTH_REQUIRED", raising=False)
    monkeypatch.setenv("NODE_ENV", "development")
    mod = importlib.import_module("speech_service.internal_auth")
    importlib.reload(mod)
    mod.require_configured_api_token("", None)
