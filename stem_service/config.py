"""Stem service config: repo root and model paths (no external links)."""
import os
import shutil
from pathlib import Path

# Repo root = parent of stem_service
STEM_SERVICE_DIR = Path(__file__).resolve().parent
REPO_ROOT = STEM_SERVICE_DIR.parent
MODELS_DIR = REPO_ROOT / "models"

# Pip demucs only loads .th from --repo (see demucs/repo.py LocalRepo). We support .pth and auto-copy to .th.
HTDEMUCS_PTH = MODELS_DIR / "htdemucs.pth"
HTDEMUCS_TH = MODELS_DIR / "htdemucs.th"
MDX_NET_MODELS_DIR = MODELS_DIR / "MDX_Net_Models"
MDXNET_MODELS_DIR = MODELS_DIR / "mdxnet_models"
SILERO_VAD_JIT = MODELS_DIR / "silero_vad.jit"


def ensure_htdemucs_th() -> Path | None:
    """Ensure htdemucs.th exists in MODELS_DIR so pip demucs (--repo) can find it.
    If only htdemucs.pth exists, copy it to htdemucs.th once. Returns path to .th or None if no model."""
    if HTDEMUCS_TH.exists():
        return HTDEMUCS_TH
    if HTDEMUCS_PTH.exists():
        shutil.copy2(HTDEMUCS_PTH, HTDEMUCS_TH)
        return HTDEMUCS_TH
    return None


def htdemucs_available() -> bool:
    """True if we have a Demucs model (either .pth or .th) for htdemucs."""
    return HTDEMUCS_PTH.exists() or HTDEMUCS_TH.exists()

# Backend mode: demucs_only | hybrid (hybrid = Stage1 vocals + phase inversion + Stage2 Demucs on instrumental)
STEM_BACKEND = os.environ.get("STEM_BACKEND", "hybrid")
# Pre-trim input to vocal span with Silero VAD to speed up separation (optional)
USE_VAD_PRETRIM = os.environ.get("USE_VAD_PRETRIM", "").strip().lower() in ("1", "true", "yes")

# Target sample rate for stem output. Mix alignment and export assume consistent rate (frontend uses 44.1k).
# ONNX vocal path already writes 44100; Demucs uses model native (often 44.1k). Resample to this when adding new writers.
TARGET_SAMPLE_RATE = 44100
