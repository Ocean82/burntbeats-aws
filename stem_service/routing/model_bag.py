"""Declarative model bag: target → specialized backend availability."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from stem_service.config import resolve_models_root_file
from stem_service.mdx.model_registry import (
    _MDX_CONFIGS,
    resolve_mdx_model_path,
    resolve_single_vocal_onnx,
)
from stem_service.routing.targets import normalize_target

logger = logging.getLogger(__name__)

StemBackend = Literal["mdx_vocal", "mdx_single", "hybrid_2", "hybrid_4", "demucs_4_fallback"]

# Logical ONNX filenames for per-stem MDX models (add to _MDX_CONFIGS after shape probe).
_SINGLE_STEM_MDX: dict[str, dict[str, str]] = {
    "drums": {
        "fast": "UVR-MDX-NET-Drum.onnx",
        "high": "UVR-MDX-NET-Drum.onnx",
    },
    "bass": {
        "fast": "UVR-MDX-NET-Bass.onnx",
        "high": "UVR-MDX-NET-Bass.onnx",
    },
    "guitar": {
        "fast": "UVR-MDX-NET-Guitar.onnx",
        "high": "UVR-MDX-NET-Guitar.onnx",
    },
}

_VOCAL_TIER_ONNX: dict[str, str] = {
    "fast": "UVR_MDXNET_3_9662.onnx",
    "high": "UVR_MDXNET_KARA.onnx",
}


@dataclass(frozen=True)
class TargetModelInfo:
    target: str
    backend: StemBackend
    model_path: Path | None
    logical_name: str | None


def _resolve_mdx_file(logical_onnx: str) -> Path | None:
    declared = resolve_models_root_file(logical_onnx)
    resolved = resolve_mdx_model_path(declared)
    if resolved is not None and resolved.is_file():
        return resolved
    if declared.is_file():
        return declared
    return None


def has_mdx_config(model_path: Path) -> bool:
    from stem_service.mdx.model_registry import _logical_onnx_name

    key = _logical_onnx_name(model_path)
    return key in _MDX_CONFIGS


def resolve_vocal_model(tier: str) -> Path | None:
    logical = _VOCAL_TIER_ONNX.get(tier, _VOCAL_TIER_ONNX["high"])
    return resolve_single_vocal_onnx(logical)


def resolve_single_stem_model(target: str, tier: str) -> Path | None:
    """Return path to specialized single-stem MDX if configured and on disk."""
    t = normalize_target(target)
    tier_key = "fast" if tier == "fast" else "high"
    names = _SINGLE_STEM_MDX.get(t)
    if not names:
        return None
    logical = names.get(tier_key) or names.get("high")
    if not logical:
        return None
    path = _resolve_mdx_file(logical)
    if path is None:
        return None
    if not has_mdx_config(path):
        logger.debug(
            "Specialized model %s found but missing _MDX_CONFIGS entry; skipping",
            path.name,
        )
        return None
    return path


def target_model_info(target: str, tier: str) -> TargetModelInfo:
    t = normalize_target(target)
    if t == "vocals":
        path = resolve_vocal_model(tier)
        return TargetModelInfo(
            target=t,
            backend="mdx_vocal",
            model_path=path,
            logical_name=path.name if path else _VOCAL_TIER_ONNX.get(tier),
        )
    if t in _SINGLE_STEM_MDX:
        path = resolve_single_stem_model(t, tier)
        return TargetModelInfo(
            target=t,
            backend="mdx_single",
            model_path=path,
            logical_name=path.name if path else _SINGLE_STEM_MDX[t].get(tier),
        )
    if t in ("instrumental",):
        return TargetModelInfo(
            target=t, backend="hybrid_2", model_path=None, logical_name=None
        )
    return TargetModelInfo(
        target=t, backend="demucs_4_fallback", model_path=None, logical_name=None
    )


def specialized_available(target: str, tier: str) -> bool:
    info = target_model_info(target, tier)
    if info.backend == "mdx_vocal":
        return info.model_path is not None
    if info.backend == "mdx_single":
        return info.model_path is not None
    return False


def intent_routing_health(tier: str = "high") -> dict[str, object]:
    """Per-target specialized model readiness for /health."""
    targets = ("vocals", "drums", "bass", "guitar", "other", "instrumental")
    per_target: dict[str, dict[str, object]] = {}
    for t in targets:
        info = target_model_info(t, tier)
        per_target[t] = {
            "backend": info.backend,
            "specialized_ready": specialized_available(t, tier),
            "resolved_model": info.model_path.name if info.model_path else None,
            "logical_name": info.logical_name,
        }
    return {"tier": tier, "targets": per_target}
