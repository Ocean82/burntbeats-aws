"""Model availability checks — boolean functions reporting which models are on disk."""

import os
from pathlib import Path

from stem_service.config.paths import (
    HTDEMUCS_PTH,
    HTDEMUCS_TH,
    MODELS_BY_TYPE_DIR,
    USE_SCNET,
    get_scnet_onnx_path,
    scnet_torch_repo_root,
    scnet_torch_checkpoint_path,
    scnet_torch_config_path,
    resolve_models_root_file,
)
from stem_service.config.demucs_bags import (
    FOUR_STEM_BACKEND,
    resolve_demucs_quality_bag,
    demucs_speed_4stem_configs,
    demucs_quality_4stem_configs,
)


def htdemucs_available() -> bool:
    """True if we have a Demucs model (either .pth or .th) for htdemucs."""
    return HTDEMUCS_PTH.exists() or HTDEMUCS_TH.exists()


def stem_allow_missing_htdemucs_at_startup() -> bool:
    """When True, the API process may start without htdemucs weights (CI/tests).

    Demucs-backed separation still requires models on disk at job time.
    Set env ``STEM_ALLOW_MISSING_HTDEMUCS=1`` only for automated tests or dry runs.
    """
    return os.environ.get("STEM_ALLOW_MISSING_HTDEMUCS", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def scnet_torch_available() -> bool:
    repo = scnet_torch_repo_root()
    ck = scnet_torch_checkpoint_path()
    cfg = scnet_torch_config_path()
    return repo is not None and ck.is_file() and cfg is not None


def scnet_available() -> bool:
    """True if USE_SCNET and an SCNet path exists (ONNX and/or PyTorch)."""
    if not USE_SCNET:
        return False
    if get_scnet_onnx_path() is not None:
        return True
    return scnet_torch_available()


def four_stem_skip_scnet() -> bool:
    """When True, 4-stem jobs never attempt SCNet (PyTorch or ONNX)."""
    return FOUR_STEM_BACKEND == "hybrid"


def demucs_extra_available() -> bool:
    return resolve_demucs_quality_bag() is not None


def demucs_speed_4stem_available() -> bool:
    return bool(demucs_speed_4stem_configs())


def demucs_quality_4stem_available() -> bool:
    return bool(demucs_quality_4stem_configs())


def demucs_quality_yaml_bags_allowed() -> bool:
    """False when ``DEMUCS_QUALITY_BAG=single`` — skip multi-model YAML bags for 4-stem quality."""
    from stem_service.config.demucs_bags import _DEMUCS_QUALITY_BAG_KEY

    return _DEMUCS_QUALITY_BAG_KEY != "single"


def mdx23c_inst_available() -> bool:
    """True if MDX23C instrumental ONNX model is available (or sibling ``.ort``)."""
    p = resolve_models_root_file("mdx23c_instrumental.onnx")
    ort = p.with_suffix(".ort")
    by_type_ort = MODELS_BY_TYPE_DIR / "ort" / "mdx23c_instrumental.ort"
    return p.is_file() or ort.is_file() or by_type_ort.is_file()


def mel_band_roformer_vocal_available() -> bool:
    """True if Mel-Band Roformer vocal ONNX model is available."""
    return resolve_models_root_file("mel_band_roformer_vocals.onnx").is_file()


def mel_band_roformer_inst_available() -> bool:
    """True if Mel-Band Roformer instrumental ONNX model is available."""
    return resolve_models_root_file("mel_band_roformer_instrumental.onnx").is_file()


def bs_roformer_vocal_available() -> bool:
    """True if BS-Roformer vocal ONNX model is available."""
    return resolve_models_root_file("bs_roformer_vocal.onnx").is_file()


def bs_roformer_inst_available() -> bool:
    """True if BS-Roformer instrumental ONNX model is available."""
    return resolve_models_root_file("bs_roformer_instrumental.onnx").is_file()
