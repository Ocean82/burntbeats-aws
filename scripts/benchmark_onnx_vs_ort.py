#!/usr/bin/env python3
"""
Convert selected ONNX models to ORT (optional), then benchmark ONNX vs ORT on the same clip.

Default models (under models/):
  - Kim_Vocal_2.onnx
  - mdx23c_vocal.onnx + mdx23c_instrumental.onnx
  - htdemucs_embedded.onnx  (4-stem Demucs; override with --demucs)

Input WAV: use --wav, or first line of benchmark_song.local.txt, or BENCHMARK_SONG env.
Clips to --clip-seconds (default 30) for fair comparison.

Usage (repo root, venv active):
  python scripts/benchmark_onnx_vs_ort.py --wav "C:/path/to/song.wav"
  python scripts/benchmark_onnx_vs_ort.py --skip-convert   # only benchmark, .ort must exist

Outputs: tmp/onnx_vs_ort_benchmark/summary.json and summary.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

os.environ.setdefault("USE_VAD_PRETRIM", "0")


def _clear_session_caches() -> None:
    import stem_service.demucs_onnx as d
    import stem_service.mdx_onnx as m

    m._session_cache.clear()
    d._session_cache.clear()


def _ensure_clip(src: Path, dst: Path, clip_seconds: float) -> float:
    import soundfile as sf

    data, sr = sf.read(str(src), dtype="float32", always_2d=True)
    n = min(int(clip_seconds * sr), data.shape[0])
    dst.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(dst), data[:n], sr, subtype="PCM_16")
    return float(n) / float(sr)


def _resolve_wav(args: argparse.Namespace) -> Path:
    if args.wav:
        return Path(args.wav).resolve()
    env = (os.environ.get("BENCHMARK_SONG") or "").strip().strip('"')
    if env:
        p = Path(env).expanduser()
        if p.is_file():
            return p.resolve()
    local = REPO_ROOT / "benchmark_song.local.txt"
    if local.is_file():
        for line in local.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                p = Path(line).expanduser()
                if p.is_file():
                    return p.resolve()
    raise SystemExit(
        "No input WAV: pass --wav, set BENCHMARK_SONG, or add a path to benchmark_song.local.txt"
    )


def _convert_onnx_to_ort(onnx_path: Path) -> tuple[bool, str]:
    if not onnx_path.is_file():
        return False, f"missing: {onnx_path}"
    cmd = [
        sys.executable,
        "-m",
        "onnxruntime.tools.convert_onnx_models_to_ort",
        str(onnx_path),
        "--enable_type_reduction",
    ]
    r = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True)
    msg = (r.stdout or "") + (r.stderr or "")
    if r.returncode != 0:
        return False, msg[-4000:]
    return True, msg[-2000:]


def _bench_mdx_vocal_path(clip: Path, out_dir: Path, onnx_path: Path, use_ort: bool) -> dict:
    """MDX vocal-style model (dim 3072/512 etc.) — requires mdx_onnx._MDX_CONFIGS entry for basename."""
    from stem_service.mdx_onnx import mdx_model_configured, run_vocal_onnx

    ort_path = onnx_path.with_suffix(".ort")
    path = ort_path if use_ort and ort_path.is_file() else onnx_path
    if not path.is_file():
        return {"error": f"missing model file: {path.name}"}
    if not mdx_model_configured(path):
        return {"error": f"no _MDX_CONFIGS entry for {path.name} — add to stem_service/mdx_onnx.py"}
    _clear_session_caches()
    out_v = out_dir / "vocals.wav"
    t0 = time.perf_counter()
    r = run_vocal_onnx(
        clip,
        out_v,
        overlap=0.75,
        job_logger=None,
        model_path_override=path,
    )
    elapsed = time.perf_counter() - t0
    return {
        "model_file": path.name,
        "format": "ort" if path.suffix.lower() == ".ort" else "onnx",
        "elapsed_sec": round(elapsed, 3),
        "ok": r is not None,
    }


def _bench_mdx_inst_path(clip: Path, out_dir: Path, onnx_path: Path, use_ort: bool) -> dict:
    """MDX instrumental-style (dim 2560)."""
    from stem_service.mdx_onnx import mdx_model_configured, run_inst_onnx

    ort_path = onnx_path.with_suffix(".ort")
    path = ort_path if use_ort and ort_path.is_file() else onnx_path
    if not path.is_file():
        return {"error": f"missing model file: {path.name}"}
    if not mdx_model_configured(path):
        return {"error": f"no _MDX_CONFIGS entry for {path.name}"}
    _clear_session_caches()
    out_i = out_dir / "instrumental.wav"
    t0 = time.perf_counter()
    r = run_inst_onnx(
        clip,
        out_i,
        overlap=0.75,
        job_logger=None,
        model_path_override=path,
    )
    elapsed = time.perf_counter() - t0
    return {
        "model_file": path.name,
        "format": "ort" if path.suffix.lower() == ".ort" else "onnx",
        "elapsed_sec": round(elapsed, 3),
        "ok": r is not None,
    }


def _bench_kim(clip: Path, out_dir: Path, kim_onnx: Path, use_ort: bool) -> dict:
    return _bench_mdx_vocal_path(clip, out_dir, kim_onnx, use_ort)


def _bench_mdx23c(
    clip: Path, out_dir: Path, vocal_onnx: Path, inst_onnx: Path, use_ort: bool
) -> dict:
    from stem_service.mdx_onnx import run_inst_onnx, run_vocal_onnx

    v = vocal_onnx.with_suffix(".ort") if use_ort else vocal_onnx
    i = inst_onnx.with_suffix(".ort") if use_ort else inst_onnx
    if use_ort:
        if not v.is_file():
            v = vocal_onnx
        if not i.is_file():
            i = inst_onnx
    if not v.is_file() or not i.is_file():
        return {"error": f"missing mdx23c files: {v.name} / {i.name}"}

    _clear_session_caches()
    t0 = time.perf_counter()
    rv = run_vocal_onnx(
        clip,
        out_dir / "mdx23c_vocals.wav",
        overlap=0.75,
        model_path_override=v,
    )
    ri = run_inst_onnx(
        clip,
        out_dir / "mdx23c_inst.wav",
        overlap=0.75,
        model_path_override=i,
    )
    elapsed = time.perf_counter() - t0
    return {
        "vocal_file": v.name,
        "inst_file": i.name,
        "format": "ort" if v.suffix.lower() == ".ort" else "onnx",
        "elapsed_sec": round(elapsed, 3),
        "ok": rv is not None and ri is not None,
    }


def _bench_demucs(
    clip: Path, out_dir: Path, demucs_declared_onnx: Path, use_ort: bool
) -> dict:
    from stem_service.demucs_onnx import run_demucs_onnx_4stem

    # When both .onnx and .ort exist, resolver prefers .ort unless we force ONNX.
    try:
        if use_ort:
            os.environ.pop("BURNTBEATS_DISALLOW_ORT", None)
            p = demucs_declared_onnx.with_suffix(".ort")
            override = p if p.is_file() else demucs_declared_onnx
        else:
            os.environ["BURNTBEATS_DISALLOW_ORT"] = "1"
            override = demucs_declared_onnx
        if not override.is_file():
            return {"error": f"missing demucs model: {override}"}

        _clear_session_caches()
        t0 = time.perf_counter()
        stem_list, name = run_demucs_onnx_4stem(
            clip,
            out_dir,
            use_6s=False,
            demucs_model_override=override,
            prefer_speed=False,
        )
        elapsed = time.perf_counter() - t0
        return {
            "model_file": override.name,
            "reported": name,
            "format": "ort" if str(override).lower().endswith(".ort") else "onnx",
            "elapsed_sec": round(elapsed, 3),
            "ok": stem_list is not None,
        }
    finally:
        os.environ.pop("BURNTBEATS_DISALLOW_ORT", None)


def main() -> int:
    ap = argparse.ArgumentParser(description="Benchmark ONNX vs ORT for Kim, MDX23C, Demucs")
    ap.add_argument("--wav", type=Path, default=None, help="Input WAV (else benchmark_song.local.txt / BENCHMARK_SONG)")
    ap.add_argument("--models-dir", type=Path, default=None, help="Default: stem_service MODELS_DIR")
    ap.add_argument("--clip-seconds", type=float, default=30.0, help="Trim to first N seconds (default 30)")
    ap.add_argument("--out", type=Path, default=None, help="Output dir (default tmp/onnx_vs_ort_benchmark)")
    ap.add_argument("--skip-convert", action="store_true", help="Do not run ONNX→ORT conversion")
    ap.add_argument(
        "--demucs",
        type=str,
        default="htdemucs_embedded.onnx",
        help="Demucs 4-stem ONNX filename under models/ (default htdemucs_embedded.onnx)",
    )
    ap.add_argument(
        "--cases",
        nargs="*",
        default=None,
        metavar="CASE",
        help="Which benchmarks to run: kim_vocal mdx23c_pair demucs_4stem. "
        "Default: only cases whose ONNX files exist under models/.",
    )
    args = ap.parse_args()

    from stem_service.config import MODELS_DIR

    models_dir = (args.models_dir or MODELS_DIR).resolve()
    out_root = (args.out or (REPO_ROOT / "tmp" / "onnx_vs_ort_benchmark")).resolve()
    out_root.mkdir(parents=True, exist_ok=True)

    kim = models_dir / "Kim_Vocal_2.onnx"
    mdx_v = models_dir / "mdx23c_vocal.onnx"
    mdx_i = models_dir / "mdx23c_instrumental.onnx"
    demucs = models_dir / args.demucs

    all_case_ids = ("kim_vocal", "mdx23c_pair", "demucs_4stem")
    if args.cases:
        wanted = tuple(c for c in args.cases if c in all_case_ids)
        unknown = [c for c in args.cases if c not in all_case_ids]
        if unknown:
            print(f"Warning: unknown --cases ignored: {unknown}", file=sys.stderr)
        if not wanted:
            print("No valid --cases names.", file=sys.stderr)
            return 2
    else:
        wanted = tuple(
            c
            for c, ok in (
                ("kim_vocal", kim.is_file()),
                ("mdx23c_pair", mdx_v.is_file() and mdx_i.is_file()),
                ("demucs_4stem", demucs.is_file()),
            )
            if ok
        )
        if not wanted:
            print(
                "No benchmark cases: place Kim_Vocal_2.onnx, mdx23c_*.onnx, and/or "
                f"your Demucs ONNX ({demucs.name}) under {models_dir}, or pass --cases explicitly.",
                file=sys.stderr,
            )
            return 2
        print(f"Auto-selected cases (ONNX present): {', '.join(wanted)}")

    to_convert = [p for p in (kim, mdx_v, mdx_i, demucs) if p.is_file()]
    if not args.skip_convert and to_convert:
        print(f"Converting {len(to_convert)} ONNX file(s) to ORT (--enable_type_reduction)...")
        for p in to_convert:
            ok, log = _convert_onnx_to_ort(p)
            print(f"  {'OK' if ok else 'FAIL'}  {p.name}")
            if not ok:
                print(log[:1500])
        print()

    wav = _resolve_wav(args)
    clip_path = out_root / "clip_benchmark.wav"
    dur = _ensure_clip(wav, clip_path, args.clip_seconds)
    print(f"Clip: {clip_path}  duration={dur:.2f}s  source={wav}")

    case_runners: dict[str, Callable[[Path, bool], dict[str, Any]]] = {
        "kim_vocal": lambda o, ort: _bench_kim(clip_path, o, kim, ort),
        "mdx23c_pair": lambda o, ort: _bench_mdx23c(clip_path, o, mdx_v, mdx_i, ort),
        "demucs_4stem": lambda o, ort: _bench_demucs(clip_path, o, demucs, ort),
    }

    results: list[dict] = []

    for label in wanted:
        fn = case_runners[label]
        for use_ort, tag in ((False, "onnx"), (True, "ort")):
            sub = out_root / f"{label}_{tag}"
            sub.mkdir(parents=True, exist_ok=True)
            row = {"case": label, "backend": tag, "clip_sec": round(dur, 3)}
            try:
                row.update(fn(sub, use_ort))
            except Exception as e:
                row["error"] = repr(e)
            results.append(row)
            print(json.dumps(row, indent=0))

    summary_json = out_root / "summary.json"
    summary_json.write_text(json.dumps(results, indent=2), encoding="utf-8")
    csv_path = out_root / "summary.csv"
    if results:
        keys = sorted({k for r in results for k in r.keys()})
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(results)
    print()
    print(f"Wrote {summary_json}")
    print(f"Wrote {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
