"""Shared pytest fixtures for speech_service unit tests."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest


@pytest.fixture(autouse=True)
def reset_speech_job_queue() -> None:
    """Clear module-level queue state between tests."""
    import speech_service.job_queue as jq

    jq._queued.clear()
    jq._condition = None
    if jq._worker_task is not None:
        jq._worker_task.cancel()
    jq._worker_task = None
    jq._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="speech-worker")
    yield
    jq._queued.clear()
    jq._condition = None
    if jq._worker_task is not None:
        jq._worker_task.cancel()
    jq._worker_task = None
    jq._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="speech-worker")


@pytest.fixture(autouse=True)
def speech_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_AUTH_REQUIRED", "0")
    monkeypatch.setenv("NODE_ENV", "test")
