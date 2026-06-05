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
# DISABLED: Silero VAD is speech-tuned and clips music vocals. Default is "false".
# The pipeline ignores this setting (hybrid/utils._effective_input_path is a pass-through),
# but we keep the config for potential future use with a music-aware VAD model.
USE_VAD_PRETRIM = os.environ.get("USE_VAD_PRETRIM", "false").strip().lower() in (
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

# Quality tiers — only "speed" and "quality" exist (API rejects other values).
QUALITY_SPEED = "speed"
QUALITY_QUALITY = "quality"

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
# CPU production: quality tier uses better ONNX upstream (KARA), not Demucs shifts.
DEMUCS_SHIFTS_QUALITY = 0
DEMUCS_OVERLAP = 0.25
# htdemucs max segment is 7.8 s; keep <= 7 to stay under the limit.
DEMUCS_SEGMENT_SEC = 7
# demucs.extra bag segment (from mdx_extra_q.yaml)
DEMUCS_EXTRA_SEGMENT = 44
# Timeout for Demucs subprocess (seconds). 10 min default.
DEMUCS_TIMEOUT_SEC = int(os.environ.get("DEMUCS_TIMEOUT_SEC", "600"))
# Demucs supervised execution timeouts (seconds).
# hard: absolute cap for job runtime
# activity: max silence window after startup grace
# startup_grace: no activity timeout checks before this window
DEMUCS_TIMEOUT_HARD_SEC = int(
    os.environ.get("DEMUCS_TIMEOUT_HARD_SEC", str(DEMUCS_TIMEOUT_SEC))
)
DEMUCS_TIMEOUT_ACTIVITY_SEC = int(
    os.environ.get("DEMUCS_TIMEOUT_ACTIVITY_SEC", "180")
)
DEMUCS_TIMEOUT_STARTUP_GRACE_SEC = int(
    os.environ.get("DEMUCS_TIMEOUT_STARTUP_GRACE_SEC", "60")
)

# Maximum number of pending jobs in the separation queue.
MAX_QUEUE_DEPTH = int(os.environ.get("MAX_QUEUE_DEPTH", "5"))

# Demucs bootstrap module
_USE_DEMUCS_BOOTSTRAP_RAW = os.environ.get("USE_DEMUCS_BOOTSTRAP", "1").strip().lower()
USE_DEMUCS_BOOTSTRAP = _USE_DEMUCS_BOOTSTRAP_RAW not in ("0", "false", "no", "off")

USE_DEMUCS_SHIFTS_0 = os.environ.get("USE_DEMUCS_SHIFTS_0", "0").strip().lower() in (
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
# VAD Settings (DISABLED — kept for potential future music-aware VAD)
# =======================
VAD_PAD_SEC = 0.3
VAD_MAX_GAP_TO_MERGE_SEC = 0.3


def _bool_from_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


DEMUCS_EXECUTION_MODE = os.environ.get("DEMUCS_EXECUTION_MODE", "legacy").strip().lower()
if DEMUCS_EXECUTION_MODE not in ("legacy", "rpc", "hybrid"):
    _config_log.warning(
        "DEMUCS_EXECUTION_MODE=%r is invalid; using legacy", DEMUCS_EXECUTION_MODE
    )
    DEMUCS_EXECUTION_MODE = "legacy"
DEMUCS_RPC_CANARY_PERCENT = max(
    0, min(100, int(os.environ.get("DEMUCS_RPC_CANARY_PERCENT", "0")))
)
DEMUCS_RPC_FALLBACK_ON_ERROR = _bool_from_env("DEMUCS_RPC_FALLBACK_ON_ERROR", True)
DEMUCS_RPC_WORKERS = max(1, int(os.environ.get("DEMUCS_RPC_WORKERS", "1")))
DEMUCS_RPC_SOCKET_HOST = os.environ.get("DEMUCS_RPC_SOCKET_HOST", "127.0.0.1")
DEMUCS_RPC_SOCKET_PORT = int(os.environ.get("DEMUCS_RPC_SOCKET_PORT", "8733"))
DEMUCS_RPC_REQUEST_TIMEOUT_SEC = int(
    os.environ.get("DEMUCS_RPC_REQUEST_TIMEOUT_SEC", "300")
)
DEMUCS_RPC_HEARTBEAT_TIMEOUT_SEC = int(
    os.environ.get("DEMUCS_RPC_HEARTBEAT_TIMEOUT_SEC", "20")
)

# Phase 3 optimization controls.
DEMUCS_POLICY_QUALITY_ONLY = _bool_from_env("DEMUCS_POLICY_QUALITY_ONLY", False)
DEMUCS_RPC_MAX_CONCURRENCY = max(1, int(os.environ.get("DEMUCS_RPC_MAX_CONCURRENCY", "1")))
DEMUCS_RPC_DISABLE_RSS_MB = int(os.environ.get("DEMUCS_RPC_DISABLE_RSS_MB", "0"))

# SLO guardrails for canary / RPC rollout (evaluated from recent job metrics JSONL).
DEMUCS_SLO_MIN_SAMPLES = max(1, int(os.environ.get("DEMUCS_SLO_MIN_SAMPLES", "20")))
DEMUCS_SLO_MAX_TIMEOUT_RATE = float(os.environ.get("DEMUCS_SLO_MAX_TIMEOUT_RATE", "0.05"))
DEMUCS_SLO_MAX_ERROR_RATE = float(os.environ.get("DEMUCS_SLO_MAX_ERROR_RATE", "0.10"))
DEMUCS_SLO_AUTO_ROLLBACK = _bool_from_env("DEMUCS_SLO_AUTO_ROLLBACK", True)
