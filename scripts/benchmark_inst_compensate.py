#!/usr/bin/env python3
"""
A/B benchmark Inst_HQ_5 compensate values against mix-minus-vocal residual.

Usage:
  python scripts/benchmark_inst_compensate.py --input tmp_test/song.wav
  python scripts/benchmark_inst_compensate.py --input clip.wav --vocal tmp/vocals.wav

Writes JSON + CSV under tmp/inst_compensate_ab/ by default.
Does not change registry — use results to decide whether to update compensate.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from stem_service.config import resolve_models_root_file  # noqa: E402
from stem_service.mdx.inference import run_inst_onnx  # noqa: E402
from stem_service.mdx.model_registry import (  # noqa: E402
    _MDX_CONFIGS,
    resolve_mdx_model_path,
)

DEFAULT_CANDIDATES = (1.019, 1.02, 1.025, 1.035)
LOGICAL_INST = "UVR-MDX-NET-Inst_HQ_5.onnx"


def _rms_mono(arr: np.ndarray) -> float:
    if arr.ndim == 2:
        arr = arr.mean(axis=1)
    return float(np.sqrt(np.mean(np.square(arr.astype(np.float64)))))


def _peak_mono(arr: np.ndarray) -> float:
    if arr.ndim == 2:
        arr = arr.mean(axis=1)
    return float(np.max(np.abs(arr)))


def _residual_energy(mix: np.ndarray, inst: np.ndarray, vocal: np.ndarray) -> float:
    n = min(mix.shape[-1], inst.shape[-1], vocal.shape[-1])
    mix_m = mix[..., :n].mean(axis=0 if mix.ndim == 2 else -1)
    inst_m = inst[..., :n].mean(axis=0 if inst.ndim == 2 else -1)
    vocal_m = vocal[..., :n].mean(axis=0 if vocal.ndim == 2 else -1)
    residual = mix_m - vocal_m - inst_m
    return float(np.mean(np.square(residual.astype(np.float64))))


def _resolve_inst_path() -> Path | None:
    declared = resolve_models_root_file(LOGICAL_INST)
    resolved = resolve_mdx_model_path(declared)
    if resolved is not None and resolved.is_file():
        return resolved
    return declared if declared.is_file() else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark Inst_HQ_5 compensate values")
    parser.add_argument("--input", type=Path, required=True, help="Mix WAV/MP3 input")
    parser.add_argument(
        "--vocal",
        type=Path,
        default=None,
        help="Optional vocal stem for mix-minus residual comparison",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=REPO_ROOT / "tmp" / "inst_compensate_ab",
        help="Output directory for reports",
    )
    parser.add_argument(
        "--candidates",
        type=float,
        nargs="+",
        default=list(DEFAULT_CANDIDATES),
        help="Compensate values to test",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1

    inst_path = _resolve_inst_path()
    if inst_path is None:
        print(f"Instrumental model not found: {LOGICAL_INST}", file=sys.stderr)
        return 1

    registry_comp = _MDX_CONFIGS.get(LOGICAL_INST, (0, 0, 0, 0, 0.0))[4]
    mix, _sr = sf.read(str(args.input), dtype="float32", always_2d=True)
    mix_t = mix.T

    vocal_t: np.ndarray | None = None
    if args.vocal is not None:
        if not args.vocal.is_file():
            print(f"Vocal file not found: {args.vocal}", file=sys.stderr)
            return 1
        vocal, _v_sr = sf.read(str(args.vocal), dtype="float32", always_2d=True)
        vocal_t = vocal.T

    args.out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = args.out_dir / stamp
    run_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, object]] = []
    for comp in args.candidates:
        out_wav = run_dir / f"inst_comp_{comp:.4f}.wav"
        result = run_inst_onnx(
            args.input,
            out_wav,
            model_path_override=inst_path,
            overlap=0.75,
            compensate_override=comp,
        )
        if result is None or not out_wav.is_file():
            print(f"Inference failed for compensate={comp}", file=sys.stderr)
            return 1
        inst, _i_sr = sf.read(str(out_wav), dtype="float32", always_2d=True)
        inst_t = inst.T
        row: dict[str, object] = {
            "compensate": comp,
            "output_rms": _rms_mono(inst_t),
            "output_peak": _peak_mono(inst_t),
            "wav_path": str(out_wav.resolve()),
        }
        if vocal_t is not None:
            row["residual_energy"] = _residual_energy(mix_t, inst_t, vocal_t)
        rows.append(row)
        print(
            f"compensate={comp:.4f}  rms={row['output_rms']:.6f}  peak={row['output_peak']:.6f}"
            + (
                f"  residual={row['residual_energy']:.8f}"
                if "residual_energy" in row
                else ""
            )
        )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "input": str(args.input.resolve()),
        "vocal": str(args.vocal.resolve()) if args.vocal else None,
        "model": str(inst_path.resolve()),
        "registry_compensate": registry_comp,
        "candidates": rows,
    }
    json_path = run_dir / "results.json"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    csv_path = run_dir / "results.csv"
    fieldnames = ["compensate", "output_rms", "output_peak", "residual_energy", "wav_path"]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {json_path}")
    print(f"Wrote {csv_path}")
    if vocal_t is not None:
        best = min(rows, key=lambda r: float(r["residual_energy"]))
        print(
            f"Lowest residual_energy: compensate={best['compensate']} "
            f"(registry={registry_comp})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
