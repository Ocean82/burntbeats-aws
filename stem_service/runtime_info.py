"""Runtime fingerprint for logs, health checks, and job manifests (versions only)."""

from __future__ import annotations

import logging
import sys
import tempfile
from importlib import metadata
from pathlib import Path
from typing import Any


def _safe_version(dist_name: str) -> str | None:
    try:
        return metadata.version(dist_name)
    except metadata.PackageNotFoundError:
        return None


def get_stem_runtime_versions() -> dict[str, Any]:
    """Return import versions safe to expose in JSON (no paths or secrets)."""
    out: dict[str, Any] = {
        "python": sys.version.split()[0],
        "implementation": sys.implementation.name,
    }
    for pkg in (
        "torch",
        "torchaudio",
        "numpy",
        "onnxruntime",
        "demucs",
        "fastapi",
        "uvicorn",
    ):
        v = _safe_version(pkg)
        if v:
            out[pkg] = v
    try:
        import torch

        out["torch_cuda_available"] = bool(torch.cuda.is_available())
    except Exception:
        out["torch_cuda_available"] = None
    return out


def log_stem_runtime_versions(log: logging.Logger, level: int = logging.INFO) -> None:
    info = get_stem_runtime_versions()
    parts = [f"{k}={v!s}" for k, v in sorted(info.items())]
    log.log(level, "Stem runtime versions: %s", " ".join(parts))


def verify_torchaudio_can_load_wav(work_dir: Path | None = None) -> None:
    """Raise RuntimeError if ``torchaudio.load`` cannot read a minimal WAV.

    Catches environments where torchaudio depends on TorchCodec only (e.g. some
    Python 3.14 stacks) while the supported stack uses soundfile-backed I/O.
    """
    import numpy as np
    import soundfile as sf
    import torchaudio

    cleanup: tempfile.TemporaryDirectory | None = None
    if work_dir is not None:
        base = work_dir
        base.mkdir(parents=True, exist_ok=True)
    else:
        cleanup = tempfile.TemporaryDirectory()
        base = Path(cleanup.name)

    try:
        wav = base / "smoke_torchaudio.wav"
        sr = 44100
        y = np.zeros((256, 2), dtype=np.float32)
        sf.write(str(wav), y, sr, subtype="FLOAT")
        tensor, sr2 = torchaudio.load(str(wav))
        if tensor.numel() < 1:
            raise RuntimeError("torchaudio.load returned empty tensor")
        if int(sr2) != sr:
            raise RuntimeError(f"torchaudio.load sr mismatch: got {sr2}, expected {sr}")
    except Exception as e:
        raise RuntimeError(
            "torchaudio I/O smoke failed (install CPU torch/torchaudio per "
            "stem_service/requirements.lock.txt and use --extra-index-url "
            "https://download.pytorch.org/whl/cpu). "
            f"Original error: {e}"
        ) from e
    finally:
        if cleanup is not None:
            cleanup.cleanup()
