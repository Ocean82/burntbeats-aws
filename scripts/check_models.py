#!/usr/bin/env python3
"""Verify model configuration."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from stem_service.config import (
    MODELS_DIR,
    HTDEMUCS_TH,
    HTDEMUCS_PTH,
    htdemucs_available,
    DEMUCS_QUALITY_BAG,
    DEMUCS_EXTRA_MODELS_DIR,
    demucs_extra_available,
    speed_2stem_onnx_path,
    mdx23c_vocal_available,
    mdx23c_inst_available,
)
from stem_service.mdx_onnx import get_available_vocal_onnx, get_available_inst_onnx

print("=== Demucs Model Check ===")
print(f"MODELS_DIR: {MODELS_DIR}")
print(f"HTDEMUCS_TH: {HTDEMUCS_TH} | exists: {HTDEMUCS_TH.exists()}")
print(f"HTDEMUCS_PTH: {HTDEMUCS_PTH} | exists: {HTDEMUCS_PTH.exists()}")
print(f"htdemucs_available(): {htdemucs_available()}")

print()
print("=== Quality Bag Check ===")
print(f"DEMUCS_QUALITY_BAG: {DEMUCS_QUALITY_BAG}")
print(f"DEMUCS_EXTRA_MODELS_DIR: {DEMUCS_EXTRA_MODELS_DIR}")
print(f"demucs_extra_available(): {demucs_extra_available()}")

print()
print("=== 2-Stem ONNX Check ===")
print(f"SPEED_2STEM_ONNX: {speed_2stem_onnx_path()}")
print(f"mdx23c_vocal_available(): {mdx23c_vocal_available()}")
print(f"mdx23c_inst_available(): {mdx23c_inst_available()}")

print()
print("Available ONNX models:")
v = get_available_vocal_onnx("quality")
i = get_available_inst_onnx("quality")
print(f"  vocal (quality): {v}")
print(f"  inst (quality): {i}")

v_fast = get_available_vocal_onnx("fast")
i_fast = get_available_inst_onnx("fast")
print(f"  vocal (fast): {v_fast}")
print(f"  inst (fast): {i_fast}")
