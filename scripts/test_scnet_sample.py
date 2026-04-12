#!/usr/bin/env python3
"""
Run SCNet 4-stem on a WAV (default: models/samples/benchmark_30s.wav) and write stems to a folder.

Uses PyTorch (starrytong/SCNet) when configured, otherwise ONNX if ORT self-test passes.
Default output: repo tmp/scnet_benchmark_<UTC timestamp>/ (always a new directory; tmp/ is gitignored).
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from stem_service.config import (  # noqa: E402
    MODELS_DIR,
    get_scnet_onnx_path,
    scnet_available,
    scnet_torch_available,
)
from stem_service.scnet_onnx import (  # noqa: E402
    run_scnet_onnx_4stem,
    scnet_onnx_disable_reason,
    scnet_onnx_runtime_available,
)
from stem_service.scnet_torch import run_scnet_torch_4stem  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--wav",
        type=Path,
        default=MODELS_DIR / "samples" / "benchmark_30s.wav",
        help="Input WAV (default: models/samples/benchmark_30s.wav)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory for vocals/drums/bass/other.wav "
        "(default: tmp/scnet_benchmark_<UTC timestamp> under repo root)",
    )
    args = parser.parse_args()
    wav = args.wav.expanduser().resolve()

    if not wav.exists():
        print(f"Missing WAV: {wav}", file=sys.stderr)
        return 1
    if not scnet_available():
        print(
            "scnet_available() is False (set USE_SCNET=1 and add ONNX or PyTorch SCNet layout).",
            file=sys.stderr,
        )
        return 1

    if args.out_dir is None:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
        out_dir = (ROOT / "tmp" / f"scnet_benchmark_{ts}").resolve()
    else:
        out_dir = args.out_dir.expanduser().resolve()

    out_dir.mkdir(parents=True, exist_ok=True)

    if scnet_torch_available():
        print("Using SCNet PyTorch (subprocess)", file=sys.stderr)
        stems = run_scnet_torch_4stem(wav, out_dir, prefer_speed=True)
        if not stems:
            print("run_scnet_torch_4stem returned None", file=sys.stderr)
            return 1
        backend = "pytorch"
    else:
        onnx = get_scnet_onnx_path()
        if onnx is None:
            print(
                "No SCNet ONNX resolved and PyTorch SCNet not configured "
                "(clone SCNet to models/scnet_models/SCNet-main, checkpoint models/scnet_models/scnet.th).",
                file=sys.stderr,
            )
            return 1
        if not scnet_onnx_runtime_available():
            print(
                "SCNet ONNX runtime disabled:",
                scnet_onnx_disable_reason() or "unknown",
                file=sys.stderr,
            )
            return 1
        print("Using SCNet ONNX", file=sys.stderr)
        stems = run_scnet_onnx_4stem(wav, out_dir, prefer_speed=True)
        if not stems:
            print("run_scnet_onnx_4stem returned None", file=sys.stderr)
            return 1
        backend = f"onnx ({onnx.name})"

    for sid, p in stems:
        sz = p.stat().st_size if p.exists() else 0
        print(f"  {sid}: {p} ({sz} bytes)")
    print(f"OK: {wav.name} -> {out_dir}  [{backend}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
