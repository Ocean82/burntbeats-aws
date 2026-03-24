#!/usr/bin/env python3
"""
Deep ONNX inventory: walk models/, probe each *.onnx with ONNX Runtime, classify pipeline fit.

Writes:
  tmp/model_inventory.csv
  docs/MODEL-INVENTORY-AUTO.md  (generated — do not hand-edit)

Exclude vendor trees (e.g. demucs.onnx-main) by default.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Before any `import onnxruntime` (lazy in classify_model): reduce console noise from ORT
# shape-inference warnings on some graphs (e.g. flash-attention nodes). Not errors — models still load.
# 0=VERBOSE 1=INFO 2=WARNING 3=ERROR 4=FATAL. Override: export ORT_LOGGING_LEVEL=2
if "ORT_LOGGING_LEVEL" not in os.environ:
    os.environ["ORT_LOGGING_LEVEL"] = "3"

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

DEFAULT_EXCLUDE_PARTS = ("demucs.onnx-main", "node_modules", ".git", "__pycache__")

# stem_service/demucs_onnx.py
SEGMENT_EMBEDDED = 343980


def _dim(x: Any) -> str:
    if x is None:
        return "?"
    if isinstance(x, int):
        return str(x)
    return str(x)


def _parse_shape(shape: Any) -> list[Any]:
    if shape is None:
        return []
    return list(shape)


def classify_model(path: Path) -> dict[str, Any]:
    """Return row dict with classification fields."""
    row: dict[str, Any] = {
        "path": str(path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "name": path.name,
        "size_mb": round(path.stat().st_size / (1024 * 1024), 2),
        "load_ok": False,
        "classification": "unknown",
        "pipeline_note": "",
        "input0_rank": "",
        "input0_shape": "",
        "output_count": "",
        "ort_present": path.with_suffix(".ort").is_file(),
    }
    try:
        import onnxruntime as ort

        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    except Exception as e:
        row["classification"] = "load_error"
        row["pipeline_note"] = str(e)[:200]
        return row

    row["load_ok"] = True
    inputs = sess.get_inputs()
    outputs = sess.get_outputs()
    row["output_count"] = str(len(outputs))
    if not inputs:
        row["classification"] = "no_inputs"
        return row

    in0 = inputs[0]
    sh0 = _parse_shape(in0.shape)
    row["input0_rank"] = str(len(sh0))
    row["input0_shape"] = "[" + ", ".join(_dim(d) for d in sh0) + "]"

    low = path.name.lower()
    if "silero" in low or (low.endswith(".onnx") and "vad" in low and "kuielab" not in low):
        row["classification"] = "vad_like"
        row["pipeline_note"] = "Likely VAD — stem_service.vad"
        return row

    if in0.name and "spectrogram" in in0.name.lower():
        row["classification"] = "scnet_like"
        row["pipeline_note"] = "Spectrogram input — SCNet-style; service uses `config.SCNET_ONNX` path"
        return row

    # --- Demucs waveform branch: rank-3 (batch, 2, time) ---
    if len(sh0) == 3:
        tdim = sh0[-1]
        t_int = int(tdim) if isinstance(tdim, int) else None
        if t_int == SEGMENT_EMBEDDED:
            row["classification"] = "demucs_embedded_segment"
            row["pipeline_note"] = (
                f"Matches demucs_onnx SEGMENT_SAMPLES={SEGMENT_EMBEDDED} — qualified for current 4-stem ONNX path"
            )
        elif isinstance(t_int, int):
            row["classification"] = "demucs_waveform_other_seg"
            row["pipeline_note"] = (
                f"Waveform time={t_int}; pipeline expects {SEGMENT_EMBEDDED} for embedded export — will not run as-is"
            )
        else:
            row["classification"] = "demucs_waveform_symbolic"
            row["pipeline_note"] = "Symbolic time dim"
        return row

    # --- MDX-Net style: (batch, 4, dim_f, dim_t) ---
    if len(sh0) == 4 and (sh0[1] == 4 or str(sh0[1]) in ("4", "dim_4")):
        df = sh0[2]
        dt = sh0[3]
        df_i = int(df) if isinstance(df, int) else None
        dt_i = int(dt) if isinstance(dt, int) else None
        if df_i == 3072 and dt_i in (256, 512):
            row["classification"] = "mdx_dim3072"
            row["pipeline_note"] = (
                "MDX Kim/Vocal/Reverb class — runnable if `mdx_onnx._MDX_CONFIGS` has this filename"
            )
        elif df_i == 2048 and dt_i in (256, 512):
            row["classification"] = "mdx_dim2048"
            row["pipeline_note"] = (
                "MDX UVR-style (4096 FFT bins) — runnable if `_MDX_CONFIGS` has this filename"
            )
        elif df_i == 2560 and dt_i == 256:
            row["classification"] = "mdx_dim2560"
            row["pipeline_note"] = "MDX Inst_HQ class — runnable if `_MDX_CONFIGS` has this filename"
        else:
            row["classification"] = "mdx_like_unlisted"
            row["pipeline_note"] = f"MDX-like 4ch; dim_f={df} dim_t={dt} — needs config or manual check"
        return row

    if len(sh0) == 2:
        row["classification"] = "rank2_input"
        row["pipeline_note"] = "Unusual — inspect manually"
        return row

    row["classification"] = "unknown_shape"
    row["pipeline_note"] = "No rule matched — inspect I/O"
    return row


def _should_skip(path: Path, models_root: Path, exclude_parts: tuple[str, ...]) -> bool:
    rel = path.relative_to(models_root)
    parts = rel.parts
    for ex in exclude_parts:
        if ex in parts:
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description="Scan models/*.onnx and write inventory CSV + MD")
    ap.add_argument(
        "--models-dir",
        type=Path,
        default=None,
        help="Default: repo models/",
    )
    ap.add_argument(
        "--exclude",
        action="append",
        default=[],
        help=f"Extra path substring to exclude (repeatable). Defaults: {DEFAULT_EXCLUDE_PARTS}",
    )
    args = ap.parse_args()

    models_dir = (args.models_dir or (REPO_ROOT / "models")).resolve()
    exclude = tuple(DEFAULT_EXCLUDE_PARTS) + tuple(args.exclude)

    rows: list[dict[str, Any]] = []
    for p in sorted(models_dir.rglob("*.onnx")):
        if _should_skip(p, models_dir, exclude):
            continue
        rows.append(classify_model(p))

    tmp_csv = REPO_ROOT / "tmp" / "model_inventory.csv"
    tmp_csv.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "path",
        "name",
        "size_mb",
        "load_ok",
        "classification",
        "pipeline_note",
        "input0_rank",
        "input0_shape",
        "output_count",
        "ort_present",
    ]
    with tmp_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    md_path = REPO_ROOT / "docs" / "MODEL-INVENTORY-AUTO.md"
    utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        "# Auto-generated model inventory",
        "",
        f"**Generated (UTC):** {utc}",
        "",
        f"**Scanned:** `{models_dir.relative_to(REPO_ROOT)}` (recursive `*.onnx`)",
        "",
        "**Excluded path segments:** " + ", ".join(f"`{x}`" for x in DEFAULT_EXCLUDE_PARTS) + " (+ any `--exclude`).",
        "",
        "Machine-readable: `tmp/model_inventory.csv`",
        "",
        "## Summary counts",
        "",
    ]
    from collections import Counter

    cls_counts = Counter(r.get("classification") or "?" for r in rows)
    for k, v in sorted(cls_counts.items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- **{k}:** {v}")
    lines.extend(["", "## Full table", "", "| load | class | ORT | size MB | input0 | path |", "|------|-------|-----|---------|--------|------|"])
    for r in rows:
        sh = (r.get("input0_shape") or "")[:40]
        lines.append(
            f"| {'OK' if r.get('load_ok') else 'FAIL'} | {r.get('classification')} | "
            f"{'Y' if r.get('ort_present') else 'N'} | {r.get('size_mb')} | `{sh}` | `{r.get('path')}` |"
        )
    lines.extend(["", "## Notes", "", "- **demucs_embedded_segment** models match the current `demucs_onnx.py` chunk length.", "- **demucs_waveform_other_seg** (e.g. 441000) will fail until the pipeline is extended for that export.", "- **mdx_*** rows need a matching entry in `stem_service/mdx_onnx.py` `_MDX_CONFIGS` to run.", "- Re-run after adding ONNX files: `python scripts/scan_models_inventory.py`", ""])
    md_path.write_text("\n".join(lines), encoding="utf-8")

    print(tmp_csv)
    print(md_path)
    print(f"rows={len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
