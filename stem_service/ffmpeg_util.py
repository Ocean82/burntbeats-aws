"""Resolve ffmpeg for subprocesses (system PATH, then imageio-ffmpeg bundle)."""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def resolve_ffmpeg_executable() -> Path | None:
    """Return path to ``ffmpeg`` if available (system or imageio-ffmpeg wheel)."""
    w = shutil.which("ffmpeg")
    if w:
        return Path(w)
    try:
        import imageio_ffmpeg

        p = Path(imageio_ffmpeg.get_ffmpeg_exe())
        return p if p.is_file() else None
    except ImportError:
        return None


def ffmpeg_subprocess_env(base: dict[str, str] | None = None) -> dict[str, str]:
    """Env for child processes that call ffmpeg (matches common consumer env vars)."""
    env = dict(os.environ) if base is None else dict(base)
    ff = resolve_ffmpeg_executable()
    if ff is None or not ff.is_file():
        return env
    env["FFMPEG_BINARY"] = str(ff)
    env["IMAGEIO_FFMPEG_EXE"] = str(ff)
    parent = str(ff.parent)
    if parent and parent not in env.get("PATH", ""):
        env["PATH"] = parent + os.pathsep + env.get("PATH", "")
    return env
