#!/usr/bin/env python3
"""Probe an SCNet ONNX path: print I/O and try random ORT forward."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("onnx_path", type=Path)
    args = p.parse_args()
    path = args.onnx_path.expanduser().resolve()
    if not path.exists():
        print("missing", path)
        return 1
    import onnxruntime as ort

    s = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    i = s.get_inputs()[0]
    print("IN ", i.name, i.shape, i.type)
    for o in s.get_outputs():
        print("OUT", o.name, o.shape, o.type)
    for t in (256, 288, 320, 336, 352, 384, 512):
        x = np.random.randn(1, 4, 2049, t).astype(np.float32) * 0.01
        try:
            s.run(None, {i.name: x})
            print("random forward OK time=", t)
            return 0
        except Exception as e:
            print("fail t=", t, str(e)[:120].replace("\n", " "))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
