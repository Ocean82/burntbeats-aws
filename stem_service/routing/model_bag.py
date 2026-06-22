"""Declarative model bag: target → specialized backend availability."""

from __future__ import annotations

import logging
import os
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
FourStemBag = Literal["kuielab_b", "uvr"]

# Kuielab B — dedicated MDX for all four MUSDB stems (no residual ``other``).
_KUIELAB_B_BAG: dict[str, str] = {
    "vocals": "kuielab_b_vocals.onnx",
    "drums": "kuielab_b_drums.onnx",
    "bass": "kuielab_b_bass.onnx",
    "other": "kuielab_b_other.onnx",
}

# UVR per-stem exports (``other`` comes from phase residual in mdx_4stem).
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


def _tier_key(tier: str) -> str:
    return "fast" if tier == "fast" else "high"


def _bag_env() -> str:
    return os.environ.get("STEM_4STEM_BAG", "auto").strip().lower()


def kuielab_b_ready() -> bool:
    for logical in _KUIELAB_B_BAG.values():
        path = _resolve_mdx_file(logical)
        if path is None or not has_mdx_config(path):
            return False
    return True


def uvr_4stem_core_ready(tier: str) -> bool:
    tier_key = _tier_key(tier)
    vocal = resolve_vocal_model(tier_key)
    drums = _resolve_uvr_single_stem("drums", tier_key)
    bass = _resolve_uvr_single_stem("bass", tier_key)
    return vocal is not None and drums is not None and bass is not None


def select_4stem_bag(tier: str) -> FourStemBag | None:
    """Active bag for ``mdx_4stem`` and per-stem resolution when ``bag`` is omitted."""
    env = _bag_env()
    if env in ("kuielab", "kuielab_b"):
        return "kuielab_b" if kuielab_b_ready() else None
    if env in ("uvr", "default"):
        return "uvr" if uvr_4stem_core_ready(tier) else None
    if kuielab_b_ready():
        return "kuielab_b"
    if uvr_4stem_core_ready(tier):
        return "uvr"
    return None


def resolve_vocal_model(tier: str) -> Path | None:
    logical = _VOCAL_TIER_ONNX.get(tier, _VOCAL_TIER_ONNX["high"])
    return resolve_single_vocal_onnx(logical)


def _resolve_uvr_single_stem(target: str, tier_key: str) -> Path | None:
    names = _SINGLE_STEM_MDX.get(target)
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


def resolve_stem_model(
    target: str,
    tier: str,
    *,
    bag: FourStemBag | None = None,
) -> Path | None:
    """Resolve one stem ONNX path for intent / mdx_4stem routing."""
    t = normalize_target(target)
    tier_key = _tier_key(tier)
    active = bag or select_4stem_bag(tier_key)

    if t == "vocals":
        if active == "kuielab_b":
            path = _resolve_mdx_file(_KUIELAB_B_BAG["vocals"])
            return path if path is not None and has_mdx_config(path) else None
        return resolve_vocal_model(tier_key)

    if active == "kuielab_b" and t in _KUIELAB_B_BAG:
        path = _resolve_mdx_file(_KUIELAB_B_BAG[t])
        if path is None or not has_mdx_config(path):
            return None
        return path

    if t == "other":
        return None

    return _resolve_uvr_single_stem(t, tier_key)


def resolve_single_stem_model(
    target: str,
    tier: str,
    *,
    bag: FourStemBag | None = None,
) -> Path | None:
    """Return path to specialized single-stem MDX if configured and on disk."""
    t = normalize_target(target)
    if t in _KUIELAB_B_BAG and t != "vocals":
        return resolve_stem_model(t, tier, bag=bag)
    if t == "guitar":
        return _resolve_uvr_single_stem(t, _tier_key(tier))
    return resolve_stem_model(t, tier, bag=bag)


def target_model_info(target: str, tier: str) -> TargetModelInfo:
    t = normalize_target(target)
    tier_key = _tier_key(tier)
    if t == "vocals":
        path = resolve_stem_model(t, tier_key)
        return TargetModelInfo(
            target=t,
            backend="mdx_vocal",
            model_path=path,
            logical_name=path.name if path else _VOCAL_TIER_ONNX.get(tier_key),
        )
    if t in _KUIELAB_B_BAG or t in _SINGLE_STEM_MDX:
        path = resolve_stem_model(t, tier_key)
        logical = path.name if path else _KUIELAB_B_BAG.get(t) or _SINGLE_STEM_MDX.get(t, {}).get(
            tier_key
        )
        return TargetModelInfo(
            target=t,
            backend="mdx_single",
            model_path=path,
            logical_name=logical,
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


@dataclass(frozen=True)
class FourStemReadiness:
    """Structured readiness for the 4-stem MDX pipeline per tier."""
    ready: bool
    bag: FourStemBag | None
    resolved_models: list[str]
    missing_models: list[str]


def check_4stem_ready(tier: str) -> FourStemReadiness:
    """Canonical 4-stem MDX readiness check. Use this from /health and elsewhere."""
    tier_key = _tier_key(tier)
    bag = select_4stem_bag(tier_key)

    if bag is None:
        return FourStemReadiness(
            ready=False, bag=None,
            resolved_models=[],
            missing_models=["all_models"],
        )

    if bag == "kuielab_b":
        resolved = []
        missing = []
        for tname in ("vocals", "drums", "bass", "other"):
            logical = _KUIELAB_B_BAG[tname]
            path = _resolve_mdx_file(logical)
            if path is not None and has_mdx_config(path):
                resolved.append(path.name)
            else:
                missing.append(logical)
    else:  # uvr
        resolved = []
        missing = []
        vocal_logical = _VOCAL_TIER_ONNX.get(tier_key, "UVR_MDXNET_KARA.onnx")
        vocal = resolve_single_vocal_onnx(vocal_logical)
        if vocal:
            resolved.append(vocal.name)
        else:
            missing.append(vocal_logical)
        drums = _resolve_uvr_single_stem("drums", tier_key)
        if drums:
            resolved.append(drums.name)
        else:
            missing.append("UVR-MDX-NET-Drum.onnx")
        bass = _resolve_uvr_single_stem("bass", tier_key)
        if bass:
            resolved.append(bass.name)
        else:
            missing.append("UVR-MDX-NET-Bass.onnx")

    return FourStemReadiness(
        ready=len(missing) == 0,
        bag=bag,
        resolved_models=resolved,
        missing_models=missing,
    )


def intent_routing_health(tier: str = "high") -> dict[str, object]:
    """Per-target specialized model readiness for /health."""
    targets = ("vocals", "drums", "bass", "guitar", "other", "instrumental")
    per_target: dict[str, dict[str, object]] = {}
    bag = select_4stem_bag(tier)
    for t in targets:
        info = target_model_info(t, tier)
        per_target[t] = {
            "backend": info.backend,
            "specialized_ready": specialized_available(t, tier),
            "resolved_model": info.model_path.name if info.model_path else None,
            "logical_name": info.logical_name,
        }
    return {"tier": tier, "four_stem_bag": bag, "targets": per_target}
