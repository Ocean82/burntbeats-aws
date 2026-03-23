#!/usr/bin/env python3
"""
Run 4-stem Demucs ONNX on a WAV for each listed model; record wall time and write a dated report.

Usage (from repo root):
  python scripts/benchmark_demucs_onnx_4stem.py --input /path/to/song.wav

Default model list uses paths under models/; override with --models path1 path2 ...
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))


def _default_models() -> list[tuple[str, Path]]:
    m = REPO_ROOT / "models"
    return [
        ("best_onnx", m / "best.onnx"),
        ("htdemucs_6s_3_onnx", m / "htdemucs_6s (3).onnx"),
        ("htdemucs_onnx", m / "htdemucs.onnx"),
        ("htdemucs_embedded_onnx", m / "htdemucs_embedded.onnx"),
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description="Benchmark Demucs ONNX 4-stem models")
    ap.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Input stereo WAV",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (default: tmp/demucs_onnx_benchmark_<UTC_ts>)",
    )
    ap.add_argument(
        "--models",
        nargs="*",
        type=Path,
        default=None,
        help="Optional list of .onnx files (else use default models/ set)",
    )
    ap.add_argument(
        "--prefer-speed",
        action="store_true",
        help="Use prefer_speed=True (faster, more boundary bleed). Default: quality stride.",
    )
    args = ap.parse_args()

    if not args.input.exists():
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    ts_local = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    out_root = args.out or (REPO_ROOT / "tmp" / f"demucs_onnx_benchmark_{ts}")
    out_root.mkdir(parents=True, exist_ok=True)

    if args.models:
        pairs = [(p.stem.replace(" ", "_"), p.resolve()) for p in args.models]
    else:
        pairs = [(label, p.resolve()) for label, p in _default_models()]

    from stem_service.demucs_onnx import run_demucs_onnx_4stem

    results: list[dict] = []
    for label, onnx_path in pairs:
        row: dict = {
            "label": label,
            "model_path": str(onnx_path),
            "exists": onnx_path.exists(),
        }
        if not onnx_path.exists():
            row["error"] = "file missing"
            results.append(row)
            continue
        stem_dir = out_root / label
        stem_dir.mkdir(parents=True, exist_ok=True)
        t0 = time.perf_counter()
        try:
            stem_list, name = run_demucs_onnx_4stem(
                args.input.resolve(),
                stem_dir,
                use_6s=False,
                demucs_model_override=onnx_path,
                prefer_speed=args.prefer_speed,
            )
        except Exception as e:
            row["error"] = repr(e)
            row["seconds"] = round(time.perf_counter() - t0, 3)
            results.append(row)
            continue
        elapsed = time.perf_counter() - t0
        row["seconds"] = round(elapsed, 3)
        row["reported_model_name"] = name
        row["stem_paths"] = [str(p) for _, p in (stem_list or [])]
        row["ok"] = stem_list is not None
        results.append(row)

    report = {
        "benchmark_utc": ts,
        "benchmark_local": ts_local,
        "input": str(args.input.resolve()),
        "prefer_speed": args.prefer_speed,
        "output_dir": str(out_root.resolve()),
        "runs": results,
    }
    report_path = out_root / "BENCHMARK_REPORT.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    lines = [
        f"Demucs ONNX 4-stem benchmark",
        f"Date (local): {ts_local}",
        f"Date (UTC):  {ts}",
        f"Input: {args.input.resolve()}",
        f"prefer_speed: {args.prefer_speed}",
        f"Output: {out_root.resolve()}",
        "",
    ]
    for r in results:
        lab = r["label"]
        if r.get("ok"):
            lines.append(f"  {lab}: {r['seconds']}s  model={r.get('reported_model_name')}")
        elif "error" in r:
            lines.append(f"  {lab}: FAILED  {r.get('error')}")
        else:
            lines.append(f"  {lab}: {r.get('seconds', '?')}s  missing={not r.get('exists', True)}")
    lines.append("")
    lines.append(f"Full JSON: {report_path}")
    summary_txt = out_root / "BENCHMARK_SUMMARY.txt"
    summary_txt.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
