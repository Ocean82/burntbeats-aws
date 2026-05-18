"""Lazy-loaded LavaEnhance2 singleton."""

from __future__ import annotations

import logging
import threading

import torch

from speech_service.config import SPEECH_DEVICE, SPEECH_MODELS_DIR

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_model = None


def get_lava_model():
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        from LavaSR.model import LavaEnhance2, resolve_model_root

        device = SPEECH_DEVICE
        if device == "cuda" and not torch.cuda.is_available():
            logger.warning("SPEECH_DEVICE=cuda but CUDA unavailable; using cpu")
            device = "cpu"

        root = resolve_model_root(str(SPEECH_MODELS_DIR))
        logger.info("Loading LavaEnhance2 from %s on %s", root, device)
        _model = LavaEnhance2(str(root), device=device)
        return _model


def verify_models_at_startup() -> None:
    from LavaSR.model import resolve_model_root

    root = resolve_model_root(str(SPEECH_MODELS_DIR))
    if not (root / "enhancer_v2" / "config.yaml").is_file():
        raise FileNotFoundError(f"Missing {root / 'enhancer_v2' / 'config.yaml'}")
    denoiser_ok = any(
        (root / "denoiser" / name).is_file()
        for name in ("denoiser.safetensors", "denoiser.bin")
    )
    if not denoiser_ok:
        raise FileNotFoundError(f"Missing denoiser weights under {root / 'denoiser'}")
    enhancer_ok = any(
        (root / "enhancer_v2" / name).is_file()
        for name in ("model.safetensors", "pytorch_model.bin")
    )
    if not enhancer_ok:
        raise FileNotFoundError(f"Missing enhancer weights under {root / 'enhancer_v2'}")
