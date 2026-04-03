#!/usr/bin/env python3
"""
Legacy entry point: Demucs 4-stem ONNX benchmarking.

The in-process Demucs ONNX path (`stem_service/demucs_onnx.py`) has been removed.
4-stem separation uses SCNet ONNX (optional) and PyTorch Demucs via `htdemucs.pth` / `htdemucs.th`.

To benchmark PyTorch 4-stem timing, use `run_demucs` / `scripts/run_model_benchmark.py` instead.
"""

from __future__ import annotations

import sys


def main() -> int:
    print(
        "This script is retired: Demucs ONNX/ORT inference was removed from the codebase.\n"
        "Use PyTorch htdemucs (models/htdemucs.pth or .th) — e.g. scripts/run_model_benchmark.py "
        "for timed 4-stem runs.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
