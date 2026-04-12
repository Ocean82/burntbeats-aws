#!/usr/bin/env python3
"""Print ONNX I/O shapes for resolved SCNet ONNX (see get_scnet_onnx_path)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from stem_service.config import get_scnet_onnx_path  # noqa: E402


def main() -> int:
    import onnxruntime as ort

    onnx = get_scnet_onnx_path()
    if onnx is None:
        print("missing SCNet ONNX (env SCNET_ONNX, models/scnet_models/scnet.onnx, or models/scnet.onnx/scnet.onnx)")
        return 1
    s = ort.InferenceSession(str(onnx), providers=["CPUExecutionProvider"])
    for i in s.get_inputs():
        print("IN ", i.name, i.shape, i.type)
    for o in s.get_outputs():
        print("OUT", o.name, o.shape, o.type)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
