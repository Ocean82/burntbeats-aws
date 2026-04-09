import sys
from pathlib import Path

# Ensure repo root is on sys.path so `stem_service` resolves reliably.
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service import mdx_onnx  # noqa: E402


def test_hann_window_cache_reuses_tensor_instance() -> None:
    w1 = mdx_onnx._get_hann_window(4096)
    w2 = mdx_onnx._get_hann_window(4096)
    assert w1.data_ptr() == w2.data_ptr()
