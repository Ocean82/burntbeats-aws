"""
Derive MDX chunk parameters from ONNX tensor shapes or the runtime registry.

ONNX input shape: (batch, 4, dim_f, dim_t)
  - dim_f = first freq bins fed to the model (= n_fft // 2 for all MDX-Net exports here)
  - dim_t = fixed time frames in the spectrogram tensor

Runtime rules (see stem_service/mdx/model_registry.py):
  - hop_length is ALWAYS 1024 (not n_fft // 2)
  - n_fft = dim_f * 2  when dim_f = n_fft // 2
  - chunk_size = hop * (dim_t - 1)  → STFT with center=True yields dim_t frames

Usage:
  python scripts/probe_mdx_configs.py
  python scripts/probe_mdx_configs.py --from-registry
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

MDX_HOP = 1024

# Sample (dim_f, dim_t) pairs from probed ONNX shapes — for quick manual checks.
SAMPLE_SHAPES: dict[str, tuple[int, int]] = {
    "Kim_Vocal_2.onnx": (3072, 256),
    "UVR-MDX-NET-Voc_FT.onnx": (3072, 256),
    "UVR-MDX-NET-Inst_HQ_4.onnx": (2560, 256),
    "UVR-MDX-NET-Inst_HQ_5.onnx": (2560, 256),
    "UVR_MDXNET_1_9703.onnx": (2048, 256),
    "Reverb_HQ_By_FoxJoy.onnx": (3072, 512),
}


def derive_mdx_params(dim_f: int, dim_t: int) -> tuple[int, int, int, int]:
    """Return (n_fft, hop, chunk_samples, gen_size) from dim_f and dim_t."""
    n_fft = dim_f * 2
    hop = MDX_HOP
    chunk_samples = hop * (dim_t - 1)
    trim = n_fft // 2
    gen_size = chunk_samples - 2 * trim
    return n_fft, hop, chunk_samples, gen_size


def print_row(name: str, dim_f: int, dim_t: int, compensate: float | None = None) -> None:
    n_fft, hop, chunk_samples, gen_size = derive_mdx_params(dim_f, dim_t)
    chunk_sec = chunk_samples / 44100
    print(f"{name}:")
    print(f"  n_fft={n_fft}  hop={hop}  dim_f={dim_f}  dim_t={dim_t}", end="")
    if compensate is not None:
        print(f"  compensate={compensate}", end="")
    print()
    print(f"  chunk_samples={chunk_samples}  gen_size={gen_size}  chunk_sec={chunk_sec:.2f}s")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Print MDX STFT/chunk params")
    parser.add_argument(
        "--from-registry",
        action="store_true",
        help="Print all entries from stem_service.mdx.model_registry._MDX_CONFIGS",
    )
    args = parser.parse_args()

    if args.from_registry:
        from stem_service.mdx.model_registry import (
            KUIELAB_B_LOGICAL_ONNX,
            _MDX_CONFIGS,
            is_kuielab_b_logical_onnx,
        )

        for name in sorted(_MDX_CONFIGS):
            n_fft, hop, dim_f, dim_t, compensate = _MDX_CONFIGS[name]
            assert hop == MDX_HOP, f"{name}: hop must be {MDX_HOP}, got {hop}"
            if is_kuielab_b_logical_onnx(name):
                assert name in KUIELAB_B_LOGICAL_ONNX
            else:
                assert n_fft == dim_f * 2, f"{name}: n_fft/dim_f mismatch"
            print_row(name, dim_f, dim_t, compensate)
        return 0

    for name, (dim_f, dim_t) in SAMPLE_SHAPES.items():
        print_row(name, dim_f, dim_t)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
