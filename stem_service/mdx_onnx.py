"""
MDX-Net ONNX inference — thin re-export shim.

All implementation has moved to stem_service/mdx/ package.
This file preserves backward compatibility for existing consumers:
  from stem_service.mdx_onnx import run_vocal_onnx, get_available_vocal_onnx, ...

See: stem_service/mdx/__init__.py for the full module map.
"""

from stem_service.mdx import (  # noqa: F401
    _MDX_CONFIGS,
    VOCAL_MODEL_PATHS,
    INST_MODEL_PATHS,
    SERVICE_DISALLOWED_VOCAL_LOGICAL_ONNX,
    _VOCAL_TIER_NAMES,
    _INST_TIER_NAMES,
    is_mdx23c_vocal_checkpoint,
    vocal_onnx_allowed_for_service,
    resolve_mdx_model_path,
    mdx_model_configured,
    mdx_config_for_logical_onnx_name,
    resolve_single_vocal_onnx,
    resolve_declared_vocal_onnx_path,
    get_available_vocal_onnx,
    get_available_inst_onnx,
    _get_hann_window,
    _stft,
    _istft,
    _onnx_session,
    _run_mdx_onnx,
    run_vocal_onnx,
    run_inst_onnx,
)
