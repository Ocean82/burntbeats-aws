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

# Demucs extra bag models (for quality mode)
DEMUCS_EXTRA_MODELS_DIR = MODELS_DIR / "Demucs_Models"
DEMUCS_EXTRA_Q_YAML = DEMUCS_EXTRA_MODELS_DIR / "mdx_extra_q.yaml"
DEMUCS_EXTRA_YAML = DEMUCS_EXTRA_MODELS_DIR / "mdx_extra.yaml"

# Roformer models (for ultra quality mode)
MDX23C_CKPT = MODELS_DIR / "MDX23C-8KFFT-InstVoc_HQ.ckpt"
BS_ROFORMER_317_CKPT = (
    MODELS_DIR / "MDX_Net_Models" / "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
)
BS_ROFORMER_937_CKPT = MODELS_DIR / "model_bs_roformer_ep_937_sdr_10.5309.ckpt"
MEL_BAND_ROFORMER_CKPT = MODELS_DIR / "model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt"


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


def demucs_extra_available() -> bool:
    """True if demucs.extra bag model is available (mdx_extra_q.yaml + .th files)."""
    if not DEMUCS_EXTRA_Q_YAML.exists():
        return False
    # Check that at least one model .th file exists
    return any(DEMUCS_EXTRA_MODELS_DIR.glob("????.th"))


def mdx23c_available() -> bool:
    """True if MDX23C model is available for ultra quality."""
    return MDX23C_CKPT.exists()


def bs_roformer_available() -> bool:
    """True if Band-Split Roformer model is available for ultra quality."""
    return BS_ROFORMER_317_CKPT.exists() or BS_ROFORMER_937_CKPT.exists()


def mel_band_roformer_available() -> bool:
    """True if Mel Band Roformer model is available for ultra quality (best quality)."""
    return MEL_BAND_ROFORMER_CKPT.exists()


def get_best_ultra_model() -> Path | None:
    """Return the best available ultra quality model path."""
    if MEL_BAND_ROFORMER_CKPT.exists():
        return MEL_BAND_ROFORMER_CKPT
    if BS_ROFORMER_317_CKPT.exists():
        return BS_ROFORMER_317_CKPT
    if BS_ROFORMER_937_CKPT.exists():
        return BS_ROFORMER_937_CKPT
    if MDX23C_CKPT.exists():
        return MDX23C_CKPT
    return None


def is_cuda_available() -> bool:
    """Check if CUDA GPU is available for accelerated processing."""
    try:
        import torch

        return torch.cuda.is_available()
    except ImportError:
        return False


def get_demucs_device() -> str:
    """Get the best available device for Demucs (cuda if available, else cpu)."""
    if is_cuda_available():
        return "cuda"
    return "cpu"


# GPU acceleration setting (auto-detect unless explicitly set)
USE_GPU = os.environ.get("USE_GPU", "auto").strip().lower()
if USE_GPU == "auto":
    DEMUCS_DEVICE = get_demucs_device()
elif USE_GPU in ("1", "true", "yes"):
    DEMUCS_DEVICE = "cuda" if is_cuda_available() else "cpu"
else:
    DEMUCS_DEVICE = "cpu"


# Backend mode: demucs_only | hybrid (hybrid = Stage1 vocals + phase inversion + Stage2 Demucs on instrumental)
STEM_BACKEND = os.environ.get("STEM_BACKEND", "hybrid")
# Pre-trim input to vocal span with Silero VAD to speed up separation (default: enabled for speed)
USE_VAD_PRETRIM = os.environ.get("USE_VAD_PRETRIM", "true").strip().lower() in (
    "1",
    "true",
    "yes",
)

# Target sample rate for stem output. Mix alignment and export assume consistent rate (frontend uses 44.1k).
# ONNX vocal path already writes 44100; Demucs uses model native (often 44.1k). Resample to this when adding new writers.
TARGET_SAMPLE_RATE = 44100

# =======================
# Server Configuration
# =======================
DEFAULT_STEM_COUNT = 4
ALLOWED_STEM_COUNTS = (2, 4)
DEFAULT_QUALITY = "quality"  # or "speed" or "ultra"

# Quality tiers
QUALITY_SPEED = "speed"
QUALITY_QUALITY = "quality"
QUALITY_ULTRA = "ultra"

# =======================
# Audio Validation
# =======================
SUPPORTED_AUDIO_FORMATS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aiff"}
MIN_SAMPLE_RATE = 8000
MAX_SAMPLE_RATE = 48000
MAX_FILE_SIZE_MB = 500

# =======================
# Demucs Settings
# =======================
DEMUCS_SHIFTS_SPEED = 0
DEMUCS_SHIFTS_QUALITY = 3
DEMUCS_OVERLAP = 0.25
DEMUCS_SEGMENT_SEC = 7
DEMUCS_EXTRA_SEGMENT = 44

# =======================
# ONNX Settings
# =======================
ONNX_SEGMENT_SIZE = 256
ONNX_OVERLAP = 2

# =======================
# VAD Settings
# =======================
VAD_PAD_SEC = 0.3
VAD_MAX_GAP_TO_MERGE_SEC = 0.3
