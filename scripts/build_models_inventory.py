#!/usr/bin/env python3
"""
Build a full inventory of models/ (all dirs and files, plus model-weight summary).
Writes models/INVENTORY.md. Run from repo root: python scripts/build_models_inventory.py
"""
from __future__ import annotations

import sys
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
OUTPUT = MODELS_DIR / "INVENTORY.md"

MODEL_EXTENSIONS = (".pth", ".th", ".ckpt", ".onnx", ".safetensors", ".jit", ".pt", ".bin")
CONFIG_EXTENSIONS = (".json", ".yaml", ".yml")


def format_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    if n < 1024 * 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} MB"
    return f"{n / (1024 * 1024 * 1024):.1f} GB"


def collect(path: Path, base: Path) -> tuple[list[Path], list[Path], list[tuple[Path, int]]]:
    dirs: list[Path] = []
    files: list[Path] = []
    model_files: list[tuple[Path, int]] = []
    for p in sorted(path.iterdir()):
        rel = p.relative_to(base)
        if p.name.startswith(".") and p.name != ".gitkeep":
            continue
        if p.is_dir():
            dirs.append(rel)
            subdirs, subfiles, submodels = collect(p, base)
            dirs.extend(subdirs)
            files.extend(subfiles)
            model_files.extend(submodels)
        else:
            files.append(rel)
            if p.suffix.lower() in MODEL_EXTENSIONS:
                try:
                    model_files.append((rel, p.stat().st_size))
                except OSError:
                    model_files.append((rel, 0))
    return dirs, files, model_files


def main() -> int:
    if not MODELS_DIR.exists():
        print(f"Models dir not found: {MODELS_DIR}", file=sys.stderr)
        return 1

    dirs, files, model_files = collect(MODELS_DIR, MODELS_DIR)
    dirs_sorted = sorted(set(dirs))
    files_sorted = sorted(set(files))
    model_files_sorted = sorted(model_files, key=lambda x: (str(x[0]).lower(), x[0]))

    lines = [
        "# Models inventory",
        "",
        f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"**Source:** `{MODELS_DIR.relative_to(ROOT)}/` (recursive scan). Regenerate: `python scripts/build_models_inventory.py` or `bash scripts/build-models-inventory.sh`.",
        "",
        "### Where model paths are used (current app)",
        "",
        "| Location | Used by |",
        "|----------|--------|",
        "| `htdemucs.pth` / `htdemucs.th` | Stem splitter (Demucs); app creates `.th` from `.pth` if needed |",
        "| `silero_vad.jit` | VAD pre-trim (optional, `USE_VAD_PRETRIM=1`) |",
        "| `mdxnet_models/*.onnx` + `model_data.json` | Stage 1 vocal ONNX (vocal_stage1) |",
        "| `MDX_Net_Models/*.onnx` + `model_data/` | MDX config / ONNX fallback |",
        "| `Demucs_Models/*.th` + YAMLs | Pip demucs bag (e.g. mdx_extra); optional |",
        "| `flow-models/` | Research/generation; copy script can use htdemucs from here |",
        "| `models/` (HP2-4BAND, Vocal_HP *.pth) | v5 4-band; optional inference scripts |",
        "| Root `.ckpt` / `.onnx` | GPU or alternate backends; not default CPU pipeline |",
        "",
        "---",
        "",
        "## 1. Model weight files",
        "",
        "| Path | Size |",
        "|------|------|",
    ]
    for rel, size in model_files_sorted:
        lines.append(f"| `{rel}` | {format_size(size)} |")

    lines.extend([
        "",
        f"**Count:** {len(model_files_sorted)} model file(s)",
        "",
        "---",
        "",
        "## 2. Directory tree",
        "",
        "```",
    ])
    for d in dirs_sorted:
        depth = len(d.parts)
        lines.append("  " * (depth - 1) + d.name + "/")
    lines.append("```")
    lines.extend([
        "",
        f"**Count:** {len(dirs_sorted)} director(y/ies)",
        "",
        "---",
        "",
        "## 3. All files (flat list)",
        "",
        "```",
    ])
    for f in files_sorted:
        lines.append(str(f))
    lines.append("```")
    lines.extend([
        "",
        f"**Count:** {len(files_sorted)} file(s)",
        "",
        "---",
        "",
        "*Regenerate with:* `python scripts/build_models_inventory.py` (from repo root)",
        "",
    ])

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(model_files_sorted)} model files, {len(dirs_sorted)} dirs, {len(files_sorted)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
