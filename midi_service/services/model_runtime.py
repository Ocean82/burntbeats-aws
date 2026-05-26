from __future__ import annotations

import logging
import time
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_model_path = None


def preload_model() -> None:
    """Load the Basic Pitch ONNX model and run a warmup inference on silence."""
    global _model_path

    import tempfile

    import soundfile as sf
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict

    _model_path = ICASSP_2022_MODEL_PATH
    logger.info("Basic Pitch model path loaded: %s", _model_path)

    silence = np.zeros(22050, dtype=np.float32)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp.name, silence, 22050)
        warmup_path = tmp.name

    logger.info("Running warmup inference on 1-second silence buffer...")
    t0 = time.perf_counter()
    predict(warmup_path, model_or_model_path=_model_path)
    elapsed = time.perf_counter() - t0
    logger.info("Warmup inference completed in %.2fs", elapsed)

    Path(warmup_path).unlink(missing_ok=True)


def get_model_path():
    """Return the cached model path, loading it if necessary."""
    global _model_path
    if _model_path is None:
        from basic_pitch import ICASSP_2022_MODEL_PATH

        _model_path = ICASSP_2022_MODEL_PATH
        logger.info("Basic Pitch model loaded (lazy): %s", _model_path)
    return _model_path
