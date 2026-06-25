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
    """Raise RuntimeError if neither torchaudio nor soundfile can read a WAV.

    torchaudio 2.x+ uses TorchCodec which requires FFmpeg.  If TorchCodec is
    unavailable the function falls back to soundfile (matching the actual I/O
    paths in ``phase_inversion.py``), logging a warning that torchaudio.load
    will not work for non-WAV formats.
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

        torchaudio_ok = False
        try:
            tensor, sr2 = torchaudio.load(str(wav))
            torchaudio_ok = tensor.numel() >= 1 and int(sr2) == sr
        except Exception:
            pass

        if torchaudio_ok:
            return

        # Fallback: soundfile (the I/O path used by phase_inversion.py)
        data, sr2 = sf.read(str(wav), always_2d=True, dtype="float32")
        if data.size > 0 and int(sr2) == sr:
            logger = logging.getLogger(__name__)
            logger.warning(
                "torchaudio.load failed (TorchCodec may need FFmpeg), "
                "but soundfile works \u2014 I/O fallback path is functional"
            )
            return

        raise RuntimeError(
            "torchaudio I/O smoke failed (from repo root run: "
            "uv sync --package burntbeats-stem). "
            "Neither torchaudio.load nor soundfile can read WAV files."
        )
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(
            "torchaudio I/O smoke failed (from repo root run: "
            "uv sync --package burntbeats-stem). "
            f"Original error: {e}"
        ) from e
    finally:
        if cleanup is not None:
            cleanup.cleanup()
