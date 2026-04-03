"""Legacy helper: Demucs ONNX probing.

The service no longer ships Demucs ONNX inference; 4-stem uses PyTorch htdemucs (.pth/.th).
To inspect an ONNX file you still have locally, use `python scripts/probe_onnx.py` (edit the
`models` list there) or `python -c` with onnxruntime.
"""
import sys

print(
    "Demucs ONNX inspection was removed from this script. "
    "Use scripts/probe_onnx.py after adding paths to the `models` list.",
    file=sys.stderr,
)
raise SystemExit(1)
