"""Tests for speech_service.config environment parsing."""

from __future__ import annotations

import importlib

import pytest


def test_max_queue_depth_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SPEECH_MAX_QUEUE_DEPTH", "3")
    mod = importlib.import_module("speech_service.config")
    importlib.reload(mod)
    assert mod.MAX_QUEUE_DEPTH == 3


def test_supported_audio_formats_includes_wav() -> None:
    from burntbeats_common.audio import SUPPORTED_AUDIO_FORMATS

    assert ".wav" in SUPPORTED_AUDIO_FORMATS
    assert ".mp3" in SUPPORTED_AUDIO_FORMATS


def test_speech_device_defaults_to_cpu(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SPEECH_DEVICE", raising=False)
    mod = importlib.import_module("speech_service.config")
    importlib.reload(mod)
    assert mod.SPEECH_DEVICE == "cpu"
