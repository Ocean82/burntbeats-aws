"""Probe ONNX model input/output tensor names and shapes."""

import os
import sys

try:
    import onnxruntime as ort
except ImportError:
    print("onnxruntime not installed")
    sys.exit(1)

models = [
    "models/htdemucs_6s.onnx",
    "models/htdemucs_embedded.onnx",
    "models/htdemucs.onnx",
    "models/demucsv4.onnx",
    "models/silero_vad.onnx",
    "models/mdxnet_models/Kim_Vocal_2.onnx",
    "models/mdxnet_models/UVR-MDX-NET-Inst_HQ_4.onnx",
    "models/mdxnet_models/UVR-MDX-NET-Voc_FT.onnx",
    "models/mdxnet_models/Reverb_HQ_By_FoxJoy.onnx",
    "models/MDX_Net_Models/UVR-MDX-NET-Inst_HQ_5.onnx",
    "models/MDX_Net_Models/UVR_MDXNET_1_9703.onnx",
    "models/scnet.onnx/scnet.onnx",
]

for name in models:
    if not os.path.exists(name):
        print(f"MISSING: {name}")
        continue
    try:
        sess = ort.InferenceSession(name, providers=["CPUExecutionProvider"])
        print(f"=== {name} ===")
        print("  INPUTS:")
        for i in sess.get_inputs():
            print(f"    {i.name!r}: shape={i.shape} type={i.type}")
        print("  OUTPUTS:")
        for o in sess.get_outputs():
            print(f"    {o.name!r}: shape={o.shape} type={o.type}")
        print()
    except Exception as e:
        print(f"ERROR loading {name}: {e}\n")
