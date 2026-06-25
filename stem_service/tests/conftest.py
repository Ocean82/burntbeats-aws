"""Shared pytest configuration and fixtures for stem_service tests.

- Adds repo root to sys.path (eliminates module-level boilerplate)
- Provides temp output dir per test
- Provides WAV creation helpers
- Provides progress.json reading helper
- Sets test-safe environment variables
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture(autouse=True)
def stem_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("INTERNAL_SERVICE_AUTH_REQUIRED", "0")


@pytest.fixture
def tmp_output_dir(tmp_path: Path) -> Path:
    d = tmp_path / "stem_output"
    d.mkdir(parents=True, exist_ok=True)
    return d


@pytest.fixture
def create_wav(tmp_output_dir: Path):
    def _make(
        filename: str = "input.wav",
        duration_sec: float = 2.0,
        sample_rate: int = 44100,
        amplitude: float = 0.3,
    ) -> Path:
        import soundfile as sf

        t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
        tone = amplitude * np.sin(2 * np.pi * 440 * t)
        path = tmp_output_dir / filename
        sf.write(str(path), tone.astype(np.float32), sample_rate, subtype="PCM_16")
        return path

    return _make


def read_progress(job_dir: Path) -> dict:
    """Read progress.json from a job output directory."""
    import json
    return json.loads((job_dir / "progress.json").read_text(encoding="utf-8"))
