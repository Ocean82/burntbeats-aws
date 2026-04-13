"""Shared formatting for Demucs CLI subprocess failures (debuggable, bounded size)."""

from __future__ import annotations

import subprocess


def format_demucs_subprocess_failure(result: subprocess.CompletedProcess[str]) -> str:
    """Build a RuntimeError message with exit code and trimmed stdout/stderr."""
    lim = 8000
    out = (result.stdout or "").strip()
    err = (result.stderr or "").strip()
    if len(out) > lim:
        out = f"...(truncated)\n{out[-lim:]}"
    if len(err) > lim:
        err = f"...(truncated)\n{err[-lim:]}"
    return (
        f"Demucs subprocess failed (exit {result.returncode}).\n"
        f"STDOUT:\n{out or '(empty)'}\nSTDERR:\n{err or '(empty)'}"
    )
