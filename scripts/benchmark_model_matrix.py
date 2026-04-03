#!/usr/bin/env python3
"""
Full matrix: ONNX vs ORT wall time for every pipeline-qualified model under models/.

Uses tmp/model_inventory.csv (run scripts/scan_models_inventory.py first) plus
stem_service.mdx_onnx.mdx_model_configured() for MDX rows.

Benchmarks:
  - mdx_dim3072: run_vocal_onnx per file (separate ONNX/ORT runs)
  - mdx_dim2560: run_inst_onnx per file
  - demucs_embedded_segment: skipped (Demucs ONNX path removed)
  - mdx23c_pair: one row for mdx23c_vocal + mdx23c_instrumental (handled once)

Output: tmp/model_matrix_benchmark/summary.json and summary.csv

Usage:
  python scripts/scan_models_inventory.py
  python scripts/benchmark_model_matrix.py --wav path/to.wav
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
os.environ.setdefault("USE_VAD_PRETRIM", "0")


def _load_bonv():
    p = REPO_ROOT / "scripts" / "benchmark_onnx_vs_ort.py"
    spec = importlib.util.spec_from_file_location("benchmark_onnx_vs_ort", p)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def _resolve_wav(wav: Path | None) -> Path:
    if wav and Path(wav).is_file():
        return Path(wav).resolve()
    env = (os.environ.get("BENCHMARK_SONG") or "").strip().strip('"')
    if env and Path(env).is_file():
        return Path(env).resolve()
    local = REPO_ROOT / "benchmark_song.local.txt"
    if local.is_file():
        for line in local.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                p = Path(line).expanduser()
                if p.is_file():
                    return p.resolve()
    raise SystemExit("Pass --wav or set BENCHMARK_SONG / benchmark_song.local.txt")


def main() -> int:
    ap = argparse.ArgumentParser(description="Benchmark ONNX vs ORT for all qualified models")
    ap.add_argument("--wav", type=Path, default=None)
    ap.add_argument("--inventory", type=Path, default=None, help="Default tmp/model_inventory.csv")
    ap.add_argument("--clip-seconds", type=float, default=30.0)
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    inv_path = (args.inventory or (REPO_ROOT / "tmp" / "model_inventory.csv")).resolve()
    if not inv_path.is_file():
        raise SystemExit(f"Missing {inv_path} — run: python scripts/scan_models_inventory.py")

    rows_in: list[dict[str, str]] = []
    with inv_path.open(encoding="utf-8") as f:
        rows_in = list(csv.DictReader(f))
    # Prefer shallower paths first so models/X.onnx wins over duplicate copies in subfolders
    rows_in.sort(
        key=lambda r: ((r.get("path") or "").count("/"), r.get("path") or "")
    )

    bonv = _load_bonv()
    wav = _resolve_wav(args.wav)
    out_root = (args.out or (REPO_ROOT / "tmp" / "model_matrix_benchmark")).resolve()
    out_root.mkdir(parents=True, exist_ok=True)
    clip_path = out_root / "clip_benchmark.wav"
    dur = bonv._ensure_clip(wav, clip_path, args.clip_seconds)

    from stem_service.config import MODELS_DIR
    from stem_service.mdx_onnx import mdx_model_configured

    results: list[dict[str, Any]] = []
    mdx23c_done = False
    seen_model_names: set[str] = set()

    # MDX23C pair first (single combined benchmark)
    mdx_v = MODELS_DIR / "mdx23c_vocal.onnx"
    mdx_i = MODELS_DIR / "mdx23c_instrumental.onnx"
    if mdx_v.is_file() and mdx_i.is_file() and mdx_model_configured(mdx_v) and mdx_model_configured(mdx_i):
        for use_ort, tag in ((False, "onnx"), (True, "ort")):
            sub = out_root / f"mdx23c_pair_{tag}"
            sub.mkdir(parents=True, exist_ok=True)
            row: dict[str, Any] = {
                "case": "mdx23c_pair",
                "backend": tag,
                "clip_sec": round(dur, 3),
            }
            row.update(bonv._bench_mdx23c(clip_path, sub, mdx_v, mdx_i, use_ort))
            results.append(row)
            print(json.dumps(row))
        mdx23c_done = True

    for rec in rows_in:
        lo = str(rec.get("load_ok", "")).lower()
        if lo not in ("true", "1", "yes"):
            continue
        cls = rec.get("classification") or ""
        rel = rec.get("path") or ""
        path = REPO_ROOT / rel.replace("/", os.sep)
        if not path.is_file():
            continue

        if mdx23c_done and (rec.get("name") or "").lower().startswith("mdx23c_"):
            continue

        if rec.get("name") in seen_model_names:
            continue

        if cls in ("mdx_dim3072", "mdx_dim2048"):
            if not mdx_model_configured(path):
                results.append(
                    {
                        "case": f"vocal:{path.name}",
                        "backend": "skip",
                        "reason": "no _MDX_CONFIGS",
                        "clip_sec": round(dur, 3),
                    }
                )
                continue
            for use_ort, tag in ((False, "onnx"), (True, "ort")):
                sub = out_root / f"vocal_{path.stem}_{tag}"
                sub.mkdir(parents=True, exist_ok=True)
                row = {
                    "case": f"vocal:{path.name}",
                    "backend": tag,
                    "clip_sec": round(dur, 3),
                }
                row.update(bonv._bench_mdx_vocal_path(clip_path, sub, path, use_ort))
                results.append(row)
                print(json.dumps(row))
            seen_model_names.add(path.name)

        elif cls == "mdx_dim2560":
            if not mdx_model_configured(path):
                results.append(
                    {
                        "case": f"inst:{path.name}",
                        "backend": "skip",
                        "reason": "no _MDX_CONFIGS",
                        "clip_sec": round(dur, 3),
                    }
                )
                continue
            for use_ort, tag in ((False, "onnx"), (True, "ort")):
                sub = out_root / f"inst_{path.stem}_{tag}"
                sub.mkdir(parents=True, exist_ok=True)
                row = {
                    "case": f"inst:{path.name}",
                    "backend": tag,
                    "clip_sec": round(dur, 3),
                }
                row.update(bonv._bench_mdx_inst_path(clip_path, sub, path, use_ort))
                results.append(row)
                print(json.dumps(row))
            seen_model_names.add(path.name)

        elif cls == "demucs_embedded_segment":
            row = {
                "case": f"demucs:{path.name}",
                "backend": "skip",
                "reason": "Demucs ONNX benchmarking removed — use PyTorch htdemucs",
                "clip_sec": round(dur, 3),
            }
            results.append(row)
            print(json.dumps(row))
            seen_model_names.add(path.name)

    js = out_root / "summary.json"
    js.write_text(json.dumps(results, indent=2), encoding="utf-8")
    csv_path = out_root / "summary.csv"
    if results:
        keys = sorted({k for r in results for k in r.keys()})
        import csv as csv_mod

        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv_mod.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(results)
    print()
    print(f"Wrote {js}")
    print(f"Wrote {csv_path}")
    print(f"clip={clip_path} duration={dur:.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
