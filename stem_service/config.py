"""Stem service config: repo root and model paths (no external links)."""

import os
import shutil
from pathlib import Path

# Repo root = parent of stem_service
STEM_SERVICE_DIR = Path(__file__).resolve().parent
REPO_ROOT = STEM_SERVICE_DIR.parent
MODELS_DIR = REPO_ROOT / "models"

# Pip demucs only loads .th from --repo. We support .pth and auto-copy to .th.
# On CPU, prefer htdemucs.th (smaller, faster than .pth); use as optional Stage 3 refinement, not default Stage 1.
HTDEMUCS_PTH = MODELS_DIR / "htdemucs.pth"
HTDEMUCS_TH = MODELS_DIR / "htdemucs.th"
MDX_NET_MODELS_DIR = MODELS_DIR / "MDX_Net_Models"
MDXNET_MODELS_DIR = MODELS_DIR / "mdxnet_models"
SILERO_VAD_ONNX = MODELS_DIR / "silero_vad.onnx"

# Demucs extra bag models (for quality mode)
DEMUCS_EXTRA_MODELS_DIR = MODELS_DIR / "Demucs_Models"
DEMUCS_EXTRA_Q_YAML = DEMUCS_EXTRA_MODELS_DIR / "mdx_extra_q.yaml"
DEMUCS_EXTRA_YAML = DEMUCS_EXTRA_MODELS_DIR / "mdx_extra.yaml"

# Which quality bag to use: mdx_extra_q (lighter, default) | mdx_extra (heavier, better quality, slower)
DEMUCS_QUALITY_BAG = os.environ.get("DEMUCS_QUALITY_BAG", "mdx_extra_q").strip().lower()
if DEMUCS_QUALITY_BAG not in ("mdx_extra_q", "mdx_extra"):
    DEMUCS_QUALITY_BAG = "mdx_extra_q"

# On CPU, shifts=0 is much faster; shifts>0 (random shift and average) helps mainly on GPU. Default 1 (force 0) for CPU.
USE_DEMUCS_SHIFTS_0 = os.environ.get("USE_DEMUCS_SHIFTS_0", "1").strip().lower() in (
    "1",
    "true",
    "yes",
)

# Roformer / large .ckpt models: GPU-only. Very slow on CPU; do not use in CPU pipeline.
MDX23C_CKPT = MODELS_DIR / "MDX23C-8KFFT-InstVoc_HQ.ckpt"
BS_ROFORMER_317_CKPT = (
    MODELS_DIR / "MDX_Net_Models" / "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
)
BS_ROFORMER_937_CKPT = MODELS_DIR / "model_bs_roformer_ep_937_sdr_10.5309.ckpt"
MEL_BAND_ROFORMER_CKPT = MODELS_DIR / "model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt"


def ensure_htdemucs_th() -> Path | None:
    """Ensure htdemucs.th exists in MODELS_DIR so pip demucs (--repo) can find it.
    If only htdemucs.pth exists, copy it to htdemucs.th once. Returns path to .th or None if no model.
    """
    if HTDEMUCS_TH.exists():
        return HTDEMUCS_TH
    elif HTDEMUCS_PTH.exists():
        shutil.copy2(HTDEMUCS_PTH, HTDEMUCS_TH)
        return HTDEMUCS_TH
    return None


def htdemucs_available() -> bool:
    """True if we have a Demucs model (either .pth or .th) for htdemucs."""
    return HTDEMUCS_PTH.exists() or HTDEMUCS_TH.exists()


def _demucs_bag_available(yaml_path: Path, th_prefixes: tuple[str, ...]) -> bool:
    """True if yaml exists and all listed .th files (by hash prefix) exist in same dir."""
    if not yaml_path.exists():
        return False
    return all(
        any(yaml_path.parent.glob(f"{prefix}*.th")) for prefix in th_prefixes
    )


def demucs_extra_available() -> bool:
    """True if the selected quality bag (DEMUCS_QUALITY_BAG) is available."""
    if DEMUCS_QUALITY_BAG == "mdx_extra":
        # Heavy bag: e51eebcc, a1d90b5c, 5d2d6c55, cfa93e08 (from mdx_extra.yaml)
        return _demucs_bag_available(
            DEMUCS_EXTRA_YAML,
            ("e51eebcc", "a1d90b5c", "5d2d6c55", "cfa93e08"),
        )
    # mdx_extra_q: 83fc094f, 464b36d7, 14fc6a69, 7fd6ef75
    return _demucs_bag_available(
        DEMUCS_EXTRA_Q_YAML,
        ("83fc094f", "464b36d7", "14fc6a69", "7fd6ef75"),
    )


def get_demucs_quality_bag_config() -> tuple[str, Path, int, str]:
    """Return (model_name, repo_path, segment, output_subdir) for the selected quality bag.
    If selected bag unavailable, falls back to the other bag when possible."""
    want_heavy = DEMUCS_QUALITY_BAG == "mdx_extra"
    heavy_ok = _demucs_bag_available(
        DEMUCS_EXTRA_YAML,
        ("e51eebcc", "a1d90b5c", "5d2d6c55", "cfa93e08"),
    )
    light_ok = _demucs_bag_available(
        DEMUCS_EXTRA_Q_YAML,
        ("83fc094f", "464b36d7", "14fc6a69", "7fd6ef75"),
    )
    if want_heavy and heavy_ok:
        return ("mdx_extra", DEMUCS_EXTRA_MODELS_DIR, 44, "mdx_extra")
    if light_ok:
        return ("mdx_extra_q", DEMUCS_EXTRA_MODELS_DIR, 44, "mdx_extra_q")
    if heavy_ok:
        return ("mdx_extra", DEMUCS_EXTRA_MODELS_DIR, 44, "mdx_extra")
    return (
        "mdx_extra_q",
        DEMUCS_EXTRA_MODELS_DIR,
        44,
        "mdx_extra_q",
    )  # no bag available; caller should not use


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
    """Return the best available ultra quality model path (GPU-only; avoid on CPU)."""
    if MEL_BAND_ROFORMER_CKPT.exists():
        return MEL_BAND_ROFORMER_CKPT
    elif BS_ROFORMER_317_CKPT.exists():
        return BS_ROFORMER_317_CKPT
    elif BS_ROFORMER_937_CKPT.exists():
        return BS_ROFORMER_937_CKPT
    elif MDX23C_CKPT.exists():
        return MDX23C_CKPT
    return None


def ultra_available_for_device() -> bool:
    """True if an ultra model file exists. Ultra runs on CPU but is slow.
    The caller (ultra.py) raises a clear error if the inference library is missing."""
    return get_best_ultra_model() is not None


def is_cuda_available() -> bool:
    """Check if CUDA GPU is available for accelerated processing."""
    try:
        import torch

        return torch.cuda.is_available()
    except ImportError:
        return False


def get_demucs_device() -> str:
    """Get the best available device for Demucs (cuda if available, else cpu)."""
    return "cuda" if is_cuda_available() else "cpu"


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
# Pre-trim input to vocal span with Silero VAD (Stage 0). Cheap on CPU; keeps pipeline fast. Default: enabled.
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
# htdemucs max segment is 7.8 s; keep <= 7 to stay under the limit.
DEMUCS_SEGMENT_SEC = 7
# demucs.extra bag segment (from mdx_extra_q.yaml)
DEMUCS_EXTRA_SEGMENT = 44


def get_onnx_providers() -> list[str]:
    """
    Return ONNX Runtime execution providers in preferred order (GPU when available, else CPU).
    Use for InferenceSession(..., providers=get_onnx_providers()).
    Set USE_ONNX_CPU=1 to force CPU only (e.g. when GPU memory is needed elsewhere).
    """
    if os.environ.get("USE_ONNX_CPU", "").strip().lower() in ("1", "true", "yes"):
        return ["CPUExecutionProvider"]
    try:
        import onnxruntime as ort

        available = set(ort.get_available_providers())
    except ImportError:
        return ["CPUExecutionProvider"]
    # Prefer CUDA then CPU; ORT will use the first provider that can run the model.
    order = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return [p for p in order if p in available] or (
        list(available) if available else ["CPUExecutionProvider"]
    )


# =======================
# VAD Settings
# =======================
VAD_PAD_SEC = 0.3
VAD_MAX_GAP_TO_MERGE_SEC = 0.3

# =======================
# VAD Chunking (Option B from VADSLICE-CHUNKED-SEPARATION-INVESTIGATION.md)
# =======================
# Set USE_VAD_CHUNKS=1 to slice the input at silence boundaries before separation.
# Each chunk is processed independently then stems are concatenated.
# Reduces peak memory and enables future parallelization.
USE_VAD_CHUNKS = os.environ.get("USE_VAD_CHUNKS", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)
# Target chunk length in seconds (cut at nearest silence boundary at or after this)
VAD_CHUNK_LENGTH_S = int(os.environ.get("VAD_CHUNK_LENGTH_S", "30"))
# Flush a chunk early if silence gap exceeds this (seconds)
VAD_CHUNK_SILENCE_FLUSH_S = float(os.environ.get("VAD_CHUNK_SILENCE_FLUSH_S", "5.0"))
