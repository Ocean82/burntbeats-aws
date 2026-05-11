"""
ONNX InferenceSession creation and caching.

Singleton cache ensures each model is loaded once and reused across calls.
Thread-safe via lock. Session options follow docs/research/ONNX-RUNTIME.md.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Any

from stem_service.config import get_onnx_providers

logger = logging.getLogger(__name__)

_session_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()


def _onnx_session(model_path: Path) -> Any | None:
    """Get or create a cached ONNX InferenceSession."""
    cache_key = str(model_path.resolve())
    with _cache_lock:
        if cache_key in _session_cache:
            return _session_cache[cache_key]
    try:
        import onnxruntime as ort
    except ImportError:
        logger.warning("onnxruntime not installed")
        return None
    try:
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        n = os.environ.get("ONNXRUNTIME_NUM_THREADS", "")
        if n.isdigit() and int(n) >= 0:
            opts.intra_op_num_threads = int(n)
            opts.inter_op_num_threads = 1
        sess = ort.InferenceSession(
            str(model_path),
            sess_options=opts,
            providers=get_onnx_providers(),
        )
        with _cache_lock:
            _session_cache[cache_key] = sess
        logger.info(
            "ONNX session cached: %s (providers: %s)",
            model_path.name,
            sess.get_providers(),
        )
        return sess
    except Exception as e:
        logger.warning("Failed to load ONNX session %s: %s", model_path.name, e)
        return None
