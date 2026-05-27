"""
MDX-Net model registry: configs, tier assignments, and path resolution.

Authoritative source for model numeric parameters (n_fft, hop, dim_f, dim_t, compensate).
MUST stay in sync with docs/MODEL-PARAMS.md and docs/MODEL-SELECTION-AUTHORITY.md.

Tier lists MUST match docs/MODEL-SELECTION-AUTHORITY.md. Do not change
_VOCAL_TIER_NAMES or _INST_TIER_NAMES without updating that document.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from stem_service.config import (
    MDXNET_MODELS_DIR,
    MODELS_DIR,
    MODELS_BY_TYPE_DIR,
    resolve_models_root_file,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardcoded model configs (derived from tensor shapes + UVR model_data.json)
# ---------------------------------------------------------------------------
# Each entry: (n_fft, hop_length, dim_f, dim_t, compensate)
#
# IMPORTANT: hop_length is ALWAYS 1024 in UVR/MDX-Net — it is NOT n_fft//2.
# n_fft determines the frequency resolution; hop is fixed at 1024.
#
# dim_f = freq bins fed to model (first dim_f bins of STFT output)
# n_fft must satisfy: n_fft//2 + 1 >= dim_f
#   Kim_Vocal_2 / Voc_FT:  dim_f=3072 → n_fft=6144 (6144//2+1=3073 ≥ 3072 ✓)
#   Inst_HQ_4 / Inst_HQ_5: dim_f=2560 → n_fft=5120 (5120//2+1=2561 ≥ 2560 ✓)
#
# compensate: post-iSTFT amplitude correction factor (from UVR model_data.json)
_MDX_CONFIGS: dict[str, tuple[int, int, int, int, float]] = {
    #                                    n_fft   hop   dim_f  dim_t  compensate
    "Kim_Vocal_1.onnx": (6144, 1024, 3072, 256, 1.035),
    "Kim_Vocal_2.onnx": (6144, 1024, 3072, 256, 1.035),
    "UVR-MDX-NET-Voc_FT.onnx": (6144, 1024, 3072, 256, 1.035),
    "UVR-MDX-NET-Inst_HQ_4.onnx": (5120, 1024, 2560, 256, 1.035),
    "UVR-MDX-NET-Inst_HQ_5.onnx": (5120, 1024, 2560, 256, 1.035),
    # MDX23C 2-stem (MDX23C vocal/instrumental ONNX)
    "mdx23c_vocal.onnx": (6144, 1024, 3072, 256, 1.035),
    "mdx23c_instrumental.onnx": (6144, 1024, 3072, 256, 1.035),
    # Speed 2-stem default (models/model_int8.onnx): UVR/MDX int8 export
    "model_int8.onnx": (6144, 1024, 3072, 256, 1.035),
    # De-reverb model: same n_fft/dim_f as Kim, but dim_t=512 (longer context window)
    "Reverb_HQ_By_FoxJoy.onnx": (6144, 1024, 3072, 512, 1.0),
    # UVR MDX-Net numbered exports — probed [batch,4,2048,256] → n_fft=4096
    "UVR_MDXNET_1_9703.onnx": (4096, 1024, 2048, 256, 1.035),
    "UVR_MDXNET_2_9682.onnx": (4096, 1024, 2048, 256, 1.035),
    "UVR_MDXNET_3_9662.onnx": (4096, 1024, 2048, 256, 1.035),
    "UVR_MDXNET_KARA.onnx": (4096, 1024, 2048, 256, 1.035),
}

# ---------------------------------------------------------------------------
# Model path lists — first existing file wins (score-9 fast vocals only)
VOCAL_MODEL_PATHS: list[Path] = [
    resolve_models_root_file("UVR_MDXNET_3_9662.onnx"),
    resolve_models_root_file("UVR_MDXNET_KARA.onnx"),
    MDXNET_MODELS_DIR / "UVR_MDXNET_3_9662.onnx",
    MDXNET_MODELS_DIR / "UVR_MDXNET_KARA.onnx",
]

INST_MODEL_PATHS: list[Path] = [
    resolve_models_root_file("UVR-MDX-NET-Inst_HQ_5.onnx"),
    MDXNET_MODELS_DIR / "UVR-MDX-NET-Inst_HQ_5.onnx",
    resolve_models_root_file("UVR-MDX-NET-Inst_HQ_4.onnx"),
]

DEREVERB_MODEL_PATHS: list[Path] = [
    MDXNET_MODELS_DIR / "Reverb_HQ_By_FoxJoy.onnx",
    resolve_models_root_file("Reverb_HQ_By_FoxJoy.onnx"),
]

# ---------------------------------------------------------------------------
# CPU-only single-model tier assignments — MUST match docs/MODEL-SELECTION-AUTHORITY.md.
# Only "fast" and "quality" tiers exist.
# ---------------------------------------------------------------------------
_VOCAL_TIER_NAMES: dict[str, list[str]] = {
    "fast": [
        "UVR_MDXNET_3_9662.onnx",
        "UVR_MDXNET_KARA.onnx",
    ],
    "quality": [
        "Kim_Vocal_2.onnx",
        "Kim_Vocal_1.onnx",
        "UVR_MDXNET_3_9662.onnx",
        "UVR_MDXNET_KARA.onnx",
    ],
}

_INST_TIER_NAMES: dict[str, list[str]] = {
    "fast": ["UVR-MDX-NET-Inst_HQ_5.onnx"],
    "quality": ["UVR-MDX-NET-Inst_HQ_5.onnx"],
}

# Subjective score < 9 vocal checkpoints — not used at runtime.
SERVICE_DISALLOWED_VOCAL_LOGICAL_ONNX: frozenset[str] = frozenset(
    {
        "UVR_MDXNET_1_9703.onnx",
        "UVR_MDXNET_2_9682.onnx",
    }
)


# ---------------------------------------------------------------------------
# Path resolution and model lookup
# ---------------------------------------------------------------------------


def _logical_onnx_name(model_path: Path) -> str:
    """Config keys use ``*.onnx`` names; ``*.ort`` shares the same I/O as the sibling ONNX."""
    if model_path.suffix.lower() == ".ort":
        return model_path.with_suffix(".onnx").name
    return model_path.name


def is_mdx23c_vocal_checkpoint(model_path: Path) -> bool:
    """True for ``mdx23c_vocal.onnx`` / sibling ``.ort`` — single-pass vocal + optional mix-minus-vocal inst."""
    return _logical_onnx_name(model_path) == "mdx23c_vocal.onnx"


def vocal_onnx_allowed_for_service(model_path: Path) -> bool:
    """False for benchmark-ranked below-minimum vocal checkpoints (e.g. score 8.5 MDX-Net)."""
    return _logical_onnx_name(model_path) not in SERVICE_DISALLOWED_VOCAL_LOGICAL_ONNX


def resolve_mdx_model_path(declared_onnx: Path) -> Path | None:
    """
    Prefer sibling ``.ort`` (ORT format from offline conversion) over ``.onnx`` when both exist.
    Does not apply to ``*.quant.onnx`` variants (no standard ORT sibling name).

    Set env ``BURNTBEATS_DISALLOW_ORT=1`` to prefer ``.onnx`` when both exist (benchmarks).
    """
    p = declared_onnx.resolve()
    disallow_ort = os.environ.get("BURNTBEATS_DISALLOW_ORT", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    if ".quant." in p.name:
        return p if p.is_file() else None
    if disallow_ort:
        if p.suffix.lower() == ".onnx" and p.is_file():
            return p
        if p.suffix.lower() == ".ort" and p.is_file():
            return p
        return None
    if p.suffix.lower() == ".ort" and p.is_file():
        return p
    ort = p.with_suffix(".ort")
    if ort.is_file():
        return ort
    if p.suffix.lower() == ".onnx":
        typed_ort = MODELS_BY_TYPE_DIR / "ort" / ort.name
        if typed_ort.is_file():
            return typed_ort
    if p.suffix.lower() == ".onnx" and p.is_file():
        return p
    return None


def _get_config(model_path: Path) -> tuple[int, int, int, int, float] | None:
    """Return (n_fft, hop, dim_f, dim_t, compensate) for a model, or None if unknown."""
    return _MDX_CONFIGS.get(_logical_onnx_name(model_path))


def mdx_model_configured(model_path: Path) -> bool:
    """True if this ONNX model has MDX config (n_fft, hop, dim_f, dim_t) and can be run."""
    return _get_config(model_path) is not None


def mdx_config_for_logical_onnx_name(
    logical_onnx_name: str,
) -> tuple[int, int, int, int, float] | None:
    """
    Return ``(n_fft, hop_length, dim_f, dim_t, compensate)`` for a logical ``*.onnx`` key
    in ``_MDX_CONFIGS`` (same keys as tier lists in ``MODEL-SELECTION-AUTHORITY.md``).
    """
    return _MDX_CONFIGS.get(logical_onnx_name)


def _prefer_quantized(path: Path) -> Path:
    """Return .quant.onnx sibling when USE_INT8_ONNX is enabled and file exists."""
    if os.environ.get("USE_INT8_ONNX", "1").strip().lower() in ("0", "false", "no"):
        return path
    quant = path.parent / f"{path.stem}.quant.onnx"
    return quant if quant.exists() else path


def _candidate_paths_by_names(names: list[str]) -> list[Path]:
    out: list[Path] = []
    for nm in names:
        out.extend(
            [
                resolve_models_root_file(nm),
                MODELS_DIR / nm,
                MDXNET_MODELS_DIR / nm,
                MODELS_DIR / "MDX_Net_Models" / nm,
            ]
        )
    return out


def _normalize_tier(tier: str | None) -> str:
    t = (tier or "").strip().lower()
    return t if t in ("fast", "quality") else "quality"


def get_available_vocal_onnx(tier: str | None = None) -> Path | None:
    """Return first existing vocal ONNX path (tiered order, then fallback list)."""
    t = _normalize_tier(tier)
    for path in _candidate_paths_by_names(_VOCAL_TIER_NAMES[t]) + VOCAL_MODEL_PATHS:
        if path.exists():
            pq = _prefer_quantized(path)
            resolved = resolve_mdx_model_path(pq)
            chosen = resolved if resolved is not None else pq
            if vocal_onnx_allowed_for_service(chosen):
                return chosen
            continue
        ort = path.with_suffix(".ort")
        if ort.is_file() and vocal_onnx_allowed_for_service(ort):
            return ort
    return None


def resolve_single_vocal_onnx(logical_onnx_name: str) -> Path | None:
    """First on-disk path for one logical vocal ONNX name (tier search dirs)."""
    for path in _candidate_paths_by_names([logical_onnx_name]):
        if path.exists():
            pq = _prefer_quantized(path)
            resolved = resolve_mdx_model_path(pq)
            chosen = resolved if resolved is not None else pq
            if vocal_onnx_allowed_for_service(chosen) and mdx_model_configured(chosen):
                return chosen
            continue
        ort = path.with_suffix(".ort")
        if (
            ort.is_file()
            and vocal_onnx_allowed_for_service(ort)
            and mdx_model_configured(ort)
        ):
            return ort
    return None


def resolve_declared_vocal_onnx_path(model_path: Path) -> Path | None:
    """Resolve a user/benchmark override path (.onnx / .ort / .quant.onnx sibling)."""
    p = model_path
    if not p.exists():
        ort = p.with_suffix(".ort")
        if ort.is_file():
            p = ort
        else:
            return None
    pq = _prefer_quantized(p) if p.suffix.lower() == ".onnx" else p
    resolved = resolve_mdx_model_path(pq)
    chosen = resolved if resolved is not None else pq
    if not chosen.is_file():
        return None
    if not vocal_onnx_allowed_for_service(chosen) or not mdx_model_configured(chosen):
        return None
    return chosen


def get_available_inst_onnx(tier: str | None = None) -> Path | None:
    """Return first existing instrumental ONNX path (tiered order, then fallback list)."""
    t = _normalize_tier(tier)
    for path in _candidate_paths_by_names(_INST_TIER_NAMES[t]) + INST_MODEL_PATHS:
        if path.exists():
            pq = _prefer_quantized(path)
            resolved = resolve_mdx_model_path(pq)
            return resolved if resolved is not None else pq
        ort = path.with_suffix(".ort")
        if ort.is_file():
            return ort
    return None


def get_available_dereverb_onnx() -> Path | None:
    """Return first existing de-reverb ONNX path."""
    for path in DEREVERB_MODEL_PATHS:
        if path.exists():
            return path
    return None
