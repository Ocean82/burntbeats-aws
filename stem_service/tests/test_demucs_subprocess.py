"""Tests for shared Demucs subprocess error formatting."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service.demucs_subprocess import format_demucs_subprocess_failure


def test_format_demucs_subprocess_failure_includes_streams_and_code() -> None:
    r = subprocess.CompletedProcess(
        args=["demucs"],
        returncode=2,
        stdout="out tail",
        stderr="err detail",
    )
    msg = format_demucs_subprocess_failure(r)
    assert "exit 2" in msg
    assert "STDOUT:" in msg
    assert "STDERR:" in msg
    assert "err detail" in msg
