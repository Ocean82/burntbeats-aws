"""Print input/output names and shapes for Demucs ONNX models. Run from repo root."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import onnxruntime as ort

for name in ["htdemucs_6s.onnx", "htdemucs_embedded.onnx", "htdemucs.onnx", "demucsv4.onnx"]:
    path = ROOT / "models" / name
    if not path.exists():
        print(path, "not found")
        continue
    print(path.name)
    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    for i in sess.get_inputs():
        print("  in:", i.name, i.shape, i.type)
    for o in sess.get_outputs():
        print("  out:", o.name, o.shape, o.type)
    print()
