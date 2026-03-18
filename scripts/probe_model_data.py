"""Check model_data.json entries for our ONNX models."""

import hashlib
import json

models = [
    "models/mdxnet_models/UVR-MDX-NET-Inst_HQ_4.onnx",
    "models/MDX_Net_Models/UVR-MDX-NET-Inst_HQ_5.onnx",
    "models/MDX_Net_Models/UVR_MDXNET_1_9703.onnx",
    "models/mdxnet_models/Kim_Vocal_2.onnx",
    "models/mdxnet_models/UVR-MDX-NET-Voc_FT.onnx",
    "models/mdxnet_models/Reverb_HQ_By_FoxJoy.onnx",
    "models/UVR-MDX-NET-Inst_HQ_5.onnx",
    "models/UVR-MDX-NET-Voc_FT.onnx",
]

data_paths = [
    "models/mdxnet_models/model_data.json",
    "models/MDX_Net_Models/model_data/model_data.json",
]

all_data = {}
for dp in data_paths:
    try:
        with open(dp) as f:
            all_data.update(json.load(f))
    except FileNotFoundError:
        pass

for m in models:
    try:
        h = hashlib.md5(open(m, "rb").read()).hexdigest()
        entry = all_data.get(h, "NOT FOUND IN model_data.json")
        print(f"{m.split('/')[-1]}: hash={h}")
        print(f"  config: {entry}")
    except FileNotFoundError:
        print(f"MISSING FILE: {m}")
