"""Device/runtime configuration: CUDA, ONNX providers, Demucs settings, and server constants."""

import logging
import os

_config_log = logging.getLogger(__name__)

# =======================
# GPU / Device Detection
# =======================


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


# =======================
# Backend Mode
# =======================

_stem_backend_raw = os.environ.get("STEM_BACKEND", "hybrid").strip().lower()
if _stem_backend_raw == "demucs_only":
    STEM_BACKEND = "demucs_only"
elif _stem_backend_raw in ("", "hybrid"):
    STEM_BACKEND = "hybrid"
else:
    STEM_BACKEND = "hybrid"
    _config_log.warning(
        "STEM_BACKEND=%r is invalid; expected 'hybrid' or 'demucs_only'. Using 'hybrid'.",
        os.environ.get("STEM_BACKEND", ""),
    )

# Pre-trim input to vocal span with Silero VAD (Stage 0).
USE_VAD_PRETRIM = os.environ.get("USE_VAD_PRETRIM", "true").strip().lower() in (
    "1",
    "true",
    "yes",
)

# Target sample rate for stem output.
TARGET_SAMPLE_RATE = 44100

# =======================
# Server Configuration
# =======================
DEFAULT_STEM_COUNT = 4
ALLOWED_STEM_COUNTS = (2, 4)
DEFAULT_QUALITY = "quality"

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
# Timeout for Demucs subprocess (seconds). 10 min default.
DEMUCS_TIMEOUT_SEC = int(os.environ.get("DEMUCS_TIMEOUT_SEC", "600"))

# Maximum number of pending jobs in the separation queue.
MAX_QUEUE_DEPTH = int(os.environ.get("MAX_QUEUE_DEPTH", "20"))

# Demucs bootstrap module
_USE_DEMUCS_BOOTSTRAP_RAW = os.environ.get("USE_DEMUCS_BOOTSTRAP", "1").strip().lower()
USE_DEMUCS_BOOTSTRAP = _USE_DEMUCS_BOOTSTRAP_RAW not in ("0", "false", "no", "off")

USE_DEMUCS_SHIFTS_0 = os.environ.get("USE_DEMUCS_SHIFTS_0", "1").strip().lower() in (
    "1",
    "true",
    "yes",
)


def demucs_cli_module() -> str:
    """Python module to run as ``python -m <module>`` for Demucs (bootstrap vs stock CLI)."""
    return "stem_service.demucs_entry" if USE_DEMUCS_BOOTSTRAP else "demucs"


def get_onnx_providers() -> list[str]:
    """
    Return ONNX Runtime execution providers in preferred order (GPU when available, else CPU).
    Use for InferenceSession(..., providers=get_onnx_providers()).
    Set USE_ONNX_CPU=1 to force CPU only.
    """
    if os.environ.get("USE_ONNX_CPU", "").strip().lower() in ("1", "true", "yes"):
        return ["CPUExecutionProvider"]
    try:
        import onnxruntime as ort

        available = set(ort.get_available_providers())
    except ImportError:
        return ["CPUExecutionProvider"]
    # Prefer CUDA, optional OpenVINO (Intel CPU/GPU builds), then CPU.
    order = ["CUDAExecutionProvider"]
    if os.environ.get("USE_ONNX_OPENVINO", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        order.append("OpenVINOExecutionProvider")
    order.append("CPUExecutionProvider")
    return [p for p in order if p in available] or (
        list(available) if available else ["CPUExecutionProvider"]
    )


# =======================
# VAD Settings
# =======================
VAD_PAD_SEC = 0.3
VAD_MAX_GAP_TO_MERGE_SEC = 0.3

# =======================
# VAD Chunking
# =======================
USE_VAD_CHUNKS = os.environ.get("USE_VAD_CHUNKS", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)
VAD_CHUNK_LENGTH_S = int(os.environ.get("VAD_CHUNK_LENGTH_S", "30"))
VAD_CHUNK_SILENCE_FLUSH_S = float(os.environ.get("VAD_CHUNK_SILENCE_FLUSH_S", "5.0"))
