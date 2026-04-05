#!/usr/bin/env python3
from stem_service.config import speed_2stem_onnx_path, STEM_BACKEND
from stem_service.mdx_onnx import (
    get_available_inst_onnx,
    get_available_vocal_onnx,
    mdx_model_configured,
)

print(f"STEM_BACKEND: {STEM_BACKEND}")
print(f"SPEED_2STEM_ONNX: {speed_2stem_onnx_path()}")
print(f"SPEED_2STEM_ONNX exists: {speed_2stem_onnx_path().exists()}")
print(f"Is MDX configured: {mdx_model_configured(speed_2stem_onnx_path())}")
print()
print(f"Vocal ONNX (fast): {get_available_vocal_onnx('fast')}")
print(f"Vocal ONNX (quality): {get_available_vocal_onnx('quality')}")
print(f"Inst ONNX (fast): {get_available_inst_onnx('fast')}")
print(f"Inst ONNX (quality): {get_available_inst_onnx('quality')}")
