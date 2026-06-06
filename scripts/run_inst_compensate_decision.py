#!/usr/bin/env python3
"""Trim input to 30s, extract vocal, run Inst_HQ_5 compensate A/B with residual metrics."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from stem_service.config import resolve_models_root_file  # noqa: E402
from stem_service.mdx.inference import run_inst_onnx, run_vocal_onnx  # noqa: E402
from stem_service.mdx.model_registry import _MDX_CONFIGS, resolve_mdx_model_path  # noqa: E402

CANDIDATES = (1.019, 1.02, 1.025, 1.035)
LOGICAL_INST = "UVR-MDX-NET-Inst_HQ_5.onnx"


def _residual(mix: np.ndarray, inst: np.ndarray, vocal: np.ndarray) -> float:
    n = min(mix.shape[-1], inst.shape[-1], vocal.shape[-1])
    m = mix[..., :n].mean(axis=0)
    i = inst[..., :n].mean(axis=0)
    v = vocal[..., :n].mean(axis=0)
    return float(np.mean(np.square(m - v - i)))


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: run_inst_compensate_decision.py <input.wav|mp3> [work_dir]", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1])
    work = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else REPO_ROOT / "tmp" / "inst_compensate_ab" / "nirvana_30s_decision"
    )
    if not input_path.is_file():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 1

    work.mkdir(parents=True, exist_ok=True)
    clip = work / "clip_30s.wav"
    vocal = work / "vocal_ref.wav"

    mix, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    n = min(int(sr * 30), mix.shape[0])
    sf.write(str(clip), mix[:n], sr)
    print(f"clip: {clip} ({n / sr:.1f}s)")

    vocal_path = run_vocal_onnx(clip, vocal, overlap=0.75)
    if vocal_path is None:
        print("vocal extraction failed", file=sys.stderr)
        return 1
    print(f"vocal: {vocal_path}")

    inst_path = resolve_mdx_model_path(resolve_models_root_file(LOGICAL_INST))
    if inst_path is None or not inst_path.is_file():
        print(f"instrumental model missing: {LOGICAL_INST}", file=sys.stderr)
        return 1

    mix_t = sf.read(str(clip), dtype="float32", always_2d=True)[0].T
    voc_t = sf.read(str(vocal), dtype="float32", always_2d=True)[0].T

    rows: list[dict[str, float]] = []
    for comp in CANDIDATES:
        out = work / f"inst_comp_{comp:.4f}.wav"
        result = run_inst_onnx(
            clip,
            out,
            model_path_override=inst_path,
            overlap=0.75,
            compensate_override=comp,
        )
        if result is None:
            print(f"inference failed for compensate={comp}", file=sys.stderr)
            return 1
        inst_t = sf.read(str(out), dtype="float32", always_2d=True)[0].T
        mono = inst_t.mean(axis=0)
        row = {
            "compensate": comp,
            "output_rms": float(np.sqrt(np.mean(np.square(mono)))),
            "output_peak": float(np.max(np.abs(mono))),
            "residual_energy": _residual(mix_t, inst_t, voc_t),
        }
        rows.append(row)
        print(
            f"compensate={comp:.4f} rms={row['output_rms']:.6f} "
            f"residual={row['residual_energy']:.8f}"
        )

    best = min(rows, key=lambda r: r["residual_energy"])
    registry = _MDX_CONFIGS[LOGICAL_INST][4]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "input": str(input_path.resolve()),
        "clip": str(clip.resolve()),
        "registry_compensate": registry,
        "candidates": rows,
        "best_by_residual": best,
    }
    out_json = work / "results.json"
    out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"best={best['compensate']} registry={registry}")
    print(f"wrote {out_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
