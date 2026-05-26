"""Centralized CPU budget for queue workers, ONNX, Torch, and BLAS-backed libs."""

from __future__ import annotations

import logging
import os
from typing import Final

_config_log = logging.getLogger(__name__)

_BLAS_ENV_KEYS: Final[tuple[str, ...]] = (
    "OMP_NUM_THREADS",
    "MKL_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "NUMEXPR_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
)


def _positive_int_from_env(*names: str, default: int) -> int:
    for name in names:
        raw = (os.environ.get(name) or "").strip()
        if not raw:
            continue
        try:
            parsed = int(raw)
        except ValueError:
            _config_log.warning("%s=%r is invalid; expected a positive integer", name, raw)
            continue
        if parsed > 0:
            return parsed
        _config_log.warning("%s=%r is invalid; expected a positive integer", name, raw)
    return default


def cpu_worker_concurrency() -> int:
    """Shared queue concurrency for heavy CPU jobs."""
    return _positive_int_from_env("STEM_CPU_WORKERS", "SPLIT_MAX_CONCURRENCY", default=1)


def cpu_job_threads() -> int:
    """Per-job CPU thread budget shared by ONNX, Torch, and BLAS consumers."""
    detected_default = os.cpu_count() or 1
    return _positive_int_from_env(
        "STEM_CPU_THREADS",
        "DEMUCS_CPU_THREADS",
        "TORCH_CPU_THREADS",
        "ONNXRUNTIME_NUM_THREADS",
        "OMP_NUM_THREADS",
        "MKL_NUM_THREADS",
        default=detected_default,
    )


def cpu_interop_threads() -> int:
    """Torch inter-op thread budget."""
    return _positive_int_from_env(
        "STEM_CPU_INTEROP_THREADS",
        "DEMUCS_INTEROP_THREADS",
        default=1,
    )


def cpu_budget_settings() -> dict[str, int]:
    """Return the normalized CPU budget surface for logging and env propagation."""
    job_threads = cpu_job_threads()
    return {
        "queue_workers": cpu_worker_concurrency(),
        "job_threads": job_threads,
        "onnx_threads": job_threads,
        "torch_threads": job_threads,
        "torch_interop_threads": cpu_interop_threads(),
    }


def apply_cpu_budget_env() -> dict[str, int]:
    """Propagate the normalized CPU budget onto runtime env vars."""
    settings = cpu_budget_settings()
    thread_str = str(settings["job_threads"])
    interop_str = str(settings["torch_interop_threads"])

    for key in _BLAS_ENV_KEYS:
        os.environ[key] = thread_str
    os.environ["ONNXRUNTIME_NUM_THREADS"] = thread_str
    os.environ["DEMUCS_CPU_THREADS"] = thread_str
    os.environ["TORCH_CPU_THREADS"] = thread_str
    os.environ["DEMUCS_INTEROP_THREADS"] = interop_str
    os.environ["STEM_CPU_THREADS"] = thread_str
    os.environ["STEM_CPU_WORKERS"] = str(settings["queue_workers"])
    os.environ["STEM_CPU_INTEROP_THREADS"] = interop_str
    return settings


def log_cpu_budget(logger: logging.Logger) -> dict[str, int]:
    """Apply and log the effective CPU budget."""
    settings = apply_cpu_budget_env()
    logger.info(
        "CPU budget: workers=%d job_threads=%d onnx_threads=%d torch_threads=%d torch_interop_threads=%d",
        settings["queue_workers"],
        settings["job_threads"],
        settings["onnx_threads"],
        settings["torch_threads"],
        settings["torch_interop_threads"],
    )
    return settings
