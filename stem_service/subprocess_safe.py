"""Safe subprocess helpers: argv-only execution, never shell."""

from __future__ import annotations

import re
import subprocess
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

_MODEL_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


def validate_model_name(name: str) -> str:
    """Whitelist Demucs/SCNet model identifiers used as CLI arguments."""
    if not _MODEL_NAME_RE.fullmatch(name):
        raise ValueError(f"unsafe model name: {name!r}")
    return name


def validate_subprocess_argv(cmd: Sequence[str]) -> list[str]:
    """Ensure argv is a list of strings with no embedded NUL bytes."""
    if not cmd:
        raise ValueError("subprocess argv must not be empty")
    argv = [str(part) for part in cmd]
    if any("\0" in part for part in argv):
        raise ValueError("subprocess argv contains NUL byte")
    return argv


def resolve_subprocess_path(path: str | Path) -> str:
    """Return an absolute path string safe to pass as a subprocess argument."""
    return str(Path(path).resolve())


def assert_path_under_base(path: str | Path, base: str | Path) -> str:
    """Reject path arguments that escape an expected base directory."""
    resolved = Path(path).resolve()
    base_resolved = Path(base).resolve()
    if resolved == base_resolved:
        return str(resolved)
    if base_resolved not in resolved.parents:
        raise ValueError(f"path escapes base: {resolved} (base={base_resolved})")
    return str(resolved)


def assert_trusted_onnx_path(path: str | Path, models_dir: str | Path) -> str:
    """Validate an ONNX model path for subprocess conversion (under models_dir, regular file)."""
    resolved = Path(path).resolve()
    if resolved.suffix.lower() != ".onnx":
        raise ValueError(f"not an onnx file: {resolved}")
    if not resolved.is_file():
        raise ValueError(f"missing onnx file: {resolved}")
    return assert_path_under_base(resolved, models_dir)


def run_subprocess(
    cmd: Sequence[str],
    *,
    cwd: str | Path | None = None,
    env: Mapping[str, str] | None = None,
    **kwargs: Any,
) -> subprocess.CompletedProcess[str]:
    """Run a subprocess with shell=False and validated argv."""
    argv = validate_subprocess_argv(cmd)
    if cwd is not None:
        kwargs["cwd"] = str(Path(cwd).resolve())
    if env is not None:
        kwargs["env"] = dict(env)
    return subprocess.run(argv, shell=False, **kwargs)


def popen_subprocess(
    cmd: Sequence[str],
    *,
    cwd: str | Path | None = None,
    **kwargs: Any,
) -> subprocess.Popen[str]:
    """Start a subprocess with shell=False and validated argv."""
    argv = validate_subprocess_argv(cmd)
    if cwd is not None:
        kwargs["cwd"] = str(Path(cwd).resolve())
    return subprocess.Popen(argv, shell=False, **kwargs)
