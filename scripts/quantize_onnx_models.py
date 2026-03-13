#!/usr/bin/env python3
"""
Build int8-quantized ONNX models for MDX (Stage 1 vocal/instrumental).

Uses ONNX Runtime dynamic quantization: weights → int8, activations quantized
on-the-fly. Reduces memory and can speed up inference on CPUs with AVX2/AVX-VNNI
(more int8 ops per vector register). Output: for each model.onnx we write
model.quant.onnx in the same directory. The stem service prefers .quant.onnx
when present (see docs/QUANTIZATION-8BIT.md).

Run from repo root: python scripts/quantize_onnx_models.py
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO_ROOT / "models"


def main() -> int:
    try:
        from onnxruntime.quantization import QuantType, quantize_dynamic
    except ImportError:
        print("Install onnxruntime: pip install onnxruntime", file=sys.stderr)
        return 1

    # All .onnx under models/ that are not already quantized
    onnx_files = [
        p
        for p in MODELS_DIR.rglob("*.onnx")
        if p.suffix == ".onnx"
        and not p.stem.endswith(".quant")
        and p.name != "silero_vad.onnx"
    ]
    if not onnx_files:
        print("No .onnx files found under models/")
        return 0

    print(f"Found {len(onnx_files)} ONNX model(s) to quantize.")
    for fp32_path in sorted(onnx_files):
        quant_path = fp32_path.parent / f"{fp32_path.stem}.quant.onnx"
        if quant_path.exists():
            print(f"  Skip (already exists): {quant_path.relative_to(REPO_ROOT)}")
            continue
        print(f"  Quantizing: {fp32_path.relative_to(REPO_ROOT)} -> {quant_path.name}")
        try:
            quantize_dynamic(
                str(fp32_path),
                str(quant_path),
                weight_type=QuantType.QInt8,
                extra_options={"ReduceRange": False},
            )
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            return 1
    print("Done. Restart the stem service to use quantized models.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
