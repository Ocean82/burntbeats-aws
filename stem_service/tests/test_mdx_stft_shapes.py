"""STFT output shapes must match _MDX_CONFIGS dim_f/dim_t for every registered model."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

torch = pytest.importorskip("torch")

from stem_service.mdx.model_registry import (  # noqa: E402
    KUIELAB_B_LOGICAL_ONNX,
    _MDX_CONFIGS,
    is_kuielab_b_logical_onnx,
)  # noqa: E402
from stem_service.mdx.stft import _stft  # noqa: E402

MDX_HOP = 1024


@pytest.mark.parametrize(
    "logical_name,cfg",
    sorted(_MDX_CONFIGS.items()),
    ids=sorted(_MDX_CONFIGS.keys()),
)
def test_mdx_stft_matches_registry(logical_name: str, cfg: tuple[int, int, int, int, float]) -> None:
    n_fft, hop, dim_f, dim_t, _compensate = cfg
    assert hop == MDX_HOP, f"{logical_name}: hop must be {MDX_HOP}"
    assert dim_f <= n_fft // 2 + 1, f"{logical_name}: dim_f exceeds STFT bins"
    if is_kuielab_b_logical_onnx(logical_name):
        assert logical_name in KUIELAB_B_LOGICAL_ONNX
    else:
        assert n_fft == dim_f * 2, f"{logical_name}: expected n_fft=dim_f*2"

    chunk_size = hop * (dim_t - 1)
    wav = torch.zeros(1, 2, chunk_size)
    spec = _stft(wav, n_fft, hop, dim_f)
    assert spec.shape == (1, 4, dim_f, dim_t), (
        f"{logical_name}: STFT shape {tuple(spec.shape)} != (1, 4, {dim_f}, {dim_t})"
    )
