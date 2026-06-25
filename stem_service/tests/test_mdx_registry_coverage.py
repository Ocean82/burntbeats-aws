"""Every MDX-shaped ONNX under models/models_by_type/onnx must have _MDX_CONFIGS."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service.mdx.model_registry import (  # noqa: E402
    DEPRECATED_LOGICAL_ONNX,
    _MDX_CONFIGS,
    mdx_config_for_logical_onnx_name,
    mdx_model_configured,
)

ONNX_DIR = REPO_ROOT / "models" / "models_by_type" / "onnx"

# Probed from ONNX input [batch, 4, dim_f, dim_t] — hop is always 1024.
NEW_MDX_CONFIGS: dict[str, tuple[int, int, int, int, float]] = {
    "Kim_Inst.onnx": (6144, 1024, 3072, 256, 1.035),
    "UVR_MDXNET_KARA_2.onnx": (4096, 1024, 2048, 256, 1.035),
    "kuielab_b_bass.onnx": (16384, 1024, 2048, 256, 1.0),
    "kuielab_b_drums.onnx": (4096, 1024, 2048, 128, 1.0),
    "kuielab_b_other.onnx": (8192, 1024, 2048, 256, 1.0),
    "kuielab_b_vocals.onnx": (6144, 1024, 2048, 256, 1.0),
}


@pytest.mark.parametrize("logical_name,expected", list(NEW_MDX_CONFIGS.items()))
def test_new_mdx_configs_registered(
    logical_name: str, expected: tuple[int, int, int, int, float]
) -> None:
    assert mdx_config_for_logical_onnx_name(logical_name) == expected


def _is_mdx_spectrogram_input(name: str, shape: list) -> bool:
    """MDX-Net: one input [batch, 4, dim_f, dim_t] with fixed int dim_f/dim_t.

    SCNet also uses 4 channels but names the input ``spectrogram``, uses
    freq=2049 (full STFT bins), and dynamic time — exclude those here.
    """
    if len(shape) != 4 or shape[1] != 4:
        return False
    if name.lower() == "spectrogram":
        return False
    dim_f, dim_t = shape[2], shape[3]
    if not isinstance(dim_f, int) or not isinstance(dim_t, int):
        return False
    if dim_f == 2049:
        return False
    return True


def test_all_mdx_onnx_in_models_by_type_have_registry() -> None:
    onnxruntime = pytest.importorskip("onnxruntime")
    if not ONNX_DIR.is_dir():
        pytest.skip("models/models_by_type/onnx not present")

    missing: list[str] = []
    mismatched: list[str] = []

    for fp in sorted(ONNX_DIR.glob("*.onnx")):
        try:
            sess = onnxruntime.InferenceSession(
                str(fp), providers=["CPUExecutionProvider"]
            )
        except Exception:
            continue

        inputs = sess.get_inputs()
        if len(inputs) != 1:
            continue
        inp = inputs[0]
        shape = inp.shape
        if not _is_mdx_spectrogram_input(inp.name, shape):
            continue

        if fp.name in DEPRECATED_LOGICAL_ONNX:
            continue

        if not mdx_model_configured(fp):
            missing.append(fp.name)
            continue

        dim_f = shape[2]
        dim_t = shape[3]
        if not isinstance(dim_f, int) or not isinstance(dim_t, int):
            continue

        cfg = _MDX_CONFIGS[fp.name]
        if cfg[2] != dim_f or cfg[3] != dim_t:
            mismatched.append(
                f"{fp.name}: registry dim_f/dim_t={cfg[2]}/{cfg[3]} "
                f"onnx={dim_f}/{dim_t}"
            )

    assert not missing, f"Missing _MDX_CONFIGS for: {missing}"
    assert not mismatched, f"Registry/onnx shape mismatch: {mismatched}"
