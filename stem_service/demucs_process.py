"""Supervised process execution for Demucs-like heavy subprocess jobs."""

from __future__ import annotations

import os
import signal
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


class DemucsProcessTimeoutError(RuntimeError):
    """Raised when the supervised process exceeds configured timeout policy."""


class DemucsProcessCancelledError(RuntimeError):
    """Raised when queue-side cancellation interrupts a running subprocess."""


@dataclass(frozen=True)
class DemucsHealthMarker:
    """Periodic health telemetry for subprocess observability."""

    pid: int
    elapsed_seconds: float
    seconds_since_output: float
    last_output_line: str


def _kill_process_tree(process: subprocess.Popen[str]) -> None:
    """Best-effort process-tree termination for both POSIX and Windows."""
    if process.poll() is not None:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            capture_output=True,
            text=True,
            check=False,
        )
        return

    pgid = os.getpgid(process.pid)
    os.killpg(pgid, signal.SIGTERM)
    deadline = time.monotonic() + 2.0
    while process.poll() is None and time.monotonic() < deadline:
        time.sleep(0.05)
    if process.poll() is None:
        os.killpg(pgid, signal.SIGKILL)


def run_supervised_subprocess(
    *,
    cmd: list[str],
    cwd: Path,
    hard_timeout_seconds: int,
    activity_timeout_seconds: int,
    startup_grace_seconds: int,
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[DemucsHealthMarker], None] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a subprocess with staged timeout, cancellation, and health callbacks."""
    start = time.monotonic()
    last_output_ts = start
    last_line = ""

    popen_kwargs: dict[str, object] = {
        "args": cmd,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "text": True,
        "cwd": str(cwd),
    }
    if os.name == "nt":
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popen_kwargs["start_new_session"] = True

    proc = subprocess.Popen(**popen_kwargs)

    stdout_chunks: list[str] = []
    stderr_chunks: list[str] = []
    try:
        while True:
            if cancel_check and cancel_check():
                _kill_process_tree(proc)
                raise DemucsProcessCancelledError(
                    f"Demucs subprocess cancelled (pid={proc.pid})"
                )

            now = time.monotonic()
            elapsed = now - start
            silence = now - last_output_ts
            if elapsed > hard_timeout_seconds:
                _kill_process_tree(proc)
                raise DemucsProcessTimeoutError(
                    f"Demucs subprocess exceeded hard timeout "
                    f"({hard_timeout_seconds}s, pid={proc.pid})"
                )
            if elapsed > startup_grace_seconds and silence > activity_timeout_seconds:
                _kill_process_tree(proc)
                raise DemucsProcessTimeoutError(
                    f"Demucs subprocess exceeded activity timeout "
                    f"({activity_timeout_seconds}s without output, pid={proc.pid})"
                )

            try:
                stdout, stderr = proc.communicate(timeout=0.5)
                if stdout:
                    stdout_chunks.append(stdout)
                    last_output_ts = time.monotonic()
                    last_line = stdout.strip().splitlines()[-1]
                if stderr:
                    stderr_chunks.append(stderr)
                    last_output_ts = time.monotonic()
                    last_line = stderr.strip().splitlines()[-1]
                break
            except subprocess.TimeoutExpired as exc:
                if exc.output:
                    stdout_chunks.append(exc.output)
                    last_output_ts = time.monotonic()
                    last_line = exc.output.strip().splitlines()[-1]
                if exc.stderr:
                    stderr_chunks.append(exc.stderr)
                    last_output_ts = time.monotonic()
                    last_line = exc.stderr.strip().splitlines()[-1]

            if health_callback:
                health_callback(
                    DemucsHealthMarker(
                        pid=proc.pid,
                        elapsed_seconds=round(elapsed, 2),
                        seconds_since_output=round(silence, 2),
                        last_output_line=last_line,
                    )
                )

            time.sleep(0.05)
    except Exception:
        if proc.poll() is None:
            _kill_process_tree(proc)
        raise

    return subprocess.CompletedProcess(
        args=cmd,
        returncode=proc.returncode or 0,
        stdout="".join(stdout_chunks),
        stderr="".join(stderr_chunks),
    )
