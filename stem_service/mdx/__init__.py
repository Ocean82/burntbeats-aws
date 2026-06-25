"""MDX-Net ONNX inference package — barrel re-export.

All symbols previously available via ``from stem_service.mdx_onnx import X``
continue to work via the shim at ``stem_service/mdx_onnx.py``.
Direct imports from sub-modules are also supported for tighter coupling.
"""

# Model registry: configs, tier lists, path resolution
from stem_service.mdx.model_registry import (  # noqa: F401
    _MDX_CONFIGS,
    VOCAL_MODEL_PATHS,
    INST_MODEL_PATHS,
    SERVICE_DISALLOWED_VOCAL_LOGICAL_ONNX,
    _VOCAL_TIER_NAMES,
    _INST_TIER_NAMES,
    vocal_onnx_allowed_for_service,
    resolve_mdx_model_path,
    mdx_model_configured,
    mdx_config_for_logical_onnx_name,
    resolve_single_vocal_onnx,
    resolve_declared_vocal_onnx_path,
    get_available_vocal_onnx,
    get_available_inst_onnx,
)

# STFT math (pure functions, torch tensors)
from stem_service.mdx.stft import (  # noqa: F401
    _get_hann_window,
    _stft,
    _istft,
)

# ONNX session management
from stem_service.mdx.session import (  # noqa: F401
    _onnx_session,
)

# Inference pipelines
from stem_service.mdx.inference import (  # noqa: F401
    _run_mdx_onnx,
    run_vocal_onnx,
    run_inst_onnx,
)
