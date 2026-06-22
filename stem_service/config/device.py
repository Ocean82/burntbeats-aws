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
# activity: max silence window after startup grace
# startup_grace: no activity timeout checks before this window
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


def _bool_from_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# SLO guardrails for Demucs subprocess execution (evaluated from job metrics JSONL).
DEMUCS_SLO_MIN_SAMPLES = max(1, int(os.environ.get("DEMUCS_SLO_MIN_SAMPLES", "20")))
DEMUCS_SLO_MAX_TIMEOUT_RATE = float(os.environ.get("DEMUCS_SLO_MAX_TIMEOUT_RATE", "0.05"))
DEMUCS_SLO_MAX_ERROR_RATE = float(os.environ.get("DEMUCS_SLO_MAX_ERROR_RATE", "0.10"))


# =======================
# Config Validation
# =======================


def validate_config() -> bool:
    """Validate all module-level config constants at import time.
    Returns True if all checks pass; logs warnings for every issue found.
    Call from config/__init__.py to catch misconfiguration at startup.
    """
    import math

    all_ok = True
    checks: list[tuple[str, object, str, tuple]] = [
        ("DEMUCS_TIMEOUT_SEC", DEMUCS_TIMEOUT_SEC, "positive_int", (1,)),
        ("DEMUCS_TIMEOUT_ACTIVITY_SEC", DEMUCS_TIMEOUT_ACTIVITY_SEC, "positive_int", (1,)),
        ("DEMUCS_TIMEOUT_STARTUP_GRACE_SEC", DEMUCS_TIMEOUT_STARTUP_GRACE_SEC, "min_int", (0,)),
        ("MAX_QUEUE_DEPTH", MAX_QUEUE_DEPTH, "positive_int", (1,)),
        ("DEMUCS_SLO_MIN_SAMPLES", DEMUCS_SLO_MIN_SAMPLES, "positive_int", (1,)),
        ("DEMUCS_SLO_MAX_TIMEOUT_RATE", DEMUCS_SLO_MAX_TIMEOUT_RATE, "fraction", ()),
        ("DEMUCS_SLO_MAX_ERROR_RATE", DEMUCS_SLO_MAX_ERROR_RATE, "fraction", ()),
        ("STEM_BACKEND", STEM_BACKEND, "choices", ("hybrid", "demucs_only")),
        ("USE_GPU", USE_GPU, "choices", ("auto", "1", "true", "yes", "0", "false", "no")),
        ("TARGET_SAMPLE_RATE", TARGET_SAMPLE_RATE, "positive_int", (1,)),
        ("MAX_FILE_SIZE_MB", MAX_FILE_SIZE_MB, "positive_int", (1,)),
        ("DEMUCS_SHIFTS_SPEED", DEMUCS_SHIFTS_SPEED, "min_int", (0,)),
        ("DEMUCS_SHIFTS_QUALITY", DEMUCS_SHIFTS_QUALITY, "min_int", (0,)),
    ]

    for name, value, kind, args in checks:
        ok = True
        if kind == "positive_int":
            if not isinstance(value, int) or value <= 0:
                ok = False
        elif kind == "min_int":
            if not isinstance(value, (int, float)) or value < args[0]:
                ok = False
        elif kind == "fraction":
            if not isinstance(value, (int, float)) or math.isnan(value) or value < 0 or value > 1:
                ok = False
        elif kind == "choices":
            if value not in args:
                ok = False
        if not ok:
            _config_log.warning(
                "Config validation: %s=%r is invalid (expected %s %s)",
                name, value, kind, args,
            )
            all_ok = False

    if all_ok:
        _config_log.info("Config validation: all %d checks passed", len(checks))
    else:
        _config_log.warning("Config validation: some values are invalid — review warnings above")
    return all_ok
