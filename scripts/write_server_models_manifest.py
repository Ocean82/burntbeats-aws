#!/usr/bin/env python3
"""Write MANIFEST.json + LAYOUT.txt for an existing server_models/ tree (no re-export)."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

LAYOUT_NOTE = (
    "Weights are grouped by file type under models_by_type/. "
    "Tier-1 MDX models export as .ort when an ORT conversion exists (models_by_type/ort/). "
    "Kuielab 4-stem and other ONNX-only checkpoints stay under models_by_type/onnx/. "
    "Runtime resolves logical *.onnx names to either format. "
    "Set STEM_MODELS_DIR=server_models on the stem container."
)

ROLE_BY_STEM: dict[str, tuple[str, str, str | None, bool]] = {
    "UVR_MDXNET_3_9662": ("2-stem", "vocal fast", "UVR_MDXNET_3_9662.onnx", True),
    "UVR_MDXNET_KARA": ("2-stem", "vocal quality", "UVR_MDXNET_KARA.onnx", True),
    "UVR-MDX-NET-Inst_HQ_5": ("2-stem", "instrumental", "UVR-MDX-NET-Inst_HQ_5.onnx", False),
    "Kim_Vocal_2": ("2-stem", "vocal fallback", "Kim_Vocal_2.onnx", False),
    "mdx23c_vocal": ("2-stem", "vocal fallback", "mdx23c_vocal.onnx", False),
    "kuielab_b_vocals": ("4-stem", "kuielab vocals", "kuielab_b_vocals.onnx", False),
    "kuielab_b_drums": ("4-stem", "kuielab drums", "kuielab_b_drums.onnx", False),
    "kuielab_b_bass": ("4-stem", "kuielab bass", "kuielab_b_bass.onnx", False),
    "kuielab_b_other": ("4-stem", "kuielab other", "kuielab_b_other.onnx", False),
    "htdemucs": ("4-stem", "Demucs fallback", None, True),
    "scnet": ("4-stem", "SCNet ONNX", None, False),
}


def main() -> int:
    root = REPO_ROOT / "server_models"
    if not root.is_dir():
        print(f"Missing {root}")
        return 1

    entries: list[dict[str, object]] = []
    for fp in sorted(root.rglob("*")):
        if not fp.is_file() or fp.name in ("MANIFEST.json", "LAYOUT.txt"):
            continue
        rel = fp.relative_to(root).as_posix()
        stem = fp.stem
        meta = ROLE_BY_STEM.get(stem)
        if meta is None and "scnet" in rel.lower() and fp.suffix.lower() == ".onnx":
            meta = ROLE_BY_STEM["scnet"]
        pipeline, role, logical, required = meta or ("other", "unlisted", None, False)
        entries.append(
            {
                "relative_path": rel,
                "format": fp.suffix.lower().lstrip("."),
                "pipeline": pipeline,
                "role": role,
                "logical_onnx": logical,
                "required": required,
                "size_bytes": fp.stat().st_size,
            }
        )

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "generated_at": generated_at,
        "source_tree": "models (inferred — refresh via export_server_models.py)",
        "runtime_env": "STEM_MODELS_DIR=server_models",
        "layout_note": LAYOUT_NOTE,
        "files": entries,
    }
    (root / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    layout_lines = [
        "Burnt Beats server_models layout",
        f"Generated: {generated_at}",
        "",
        LAYOUT_NOTE,
        "",
        "Folder guide:",
        "  models_by_type/ort/   — ORT runtime (9662, KARA, Inst when converted)",
        "  models_by_type/onnx/  — ONNX runtime (kuielab 4-stem, ONNX-only models)",
        "  models_by_type/th/    — Demucs checkpoints",
        "",
        "Files on disk:",
    ]
    for entry in entries:
        layout_lines.append(
            f"  {entry['relative_path']}  ({entry['pipeline']}, {entry['role']})"
        )
    layout_lines.append("")
    layout_lines.append("Run: STEM_MODELS_DIR=server_models python scripts/check_models.py")
    (root / "LAYOUT.txt").write_text("\n".join(layout_lines) + "\n", encoding="utf-8")

    print(f"Wrote {root / 'MANIFEST.json'} and LAYOUT.txt ({len(entries)} files indexed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
