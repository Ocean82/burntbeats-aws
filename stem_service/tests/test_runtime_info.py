"""Tests for stem_service.runtime_info."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_get_stem_runtime_versions_has_core_keys() -> None:
    from stem_service.runtime_info import get_stem_runtime_versions

    v = get_stem_runtime_versions()
    assert v.get("python")
    assert v.get("implementation")


def test_verify_torchaudio_can_load_wav_succeeds_with_stack() -> None:
    from stem_service.runtime_info import verify_torchaudio_can_load_wav

    verify_torchaudio_can_load_wav()
