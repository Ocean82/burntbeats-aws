#!/usr/bin/env python3
"""
Exports explicitly required production models into a ``server_models/`` folder.
This avoids burdening the final deployed payload with hundreds of gigabytes of testing subsets.

**Source tree (critical):** This script always resolves weights from the **canonical** repo
``models/`` directory (including ``models/models_by_type/onnx`` and ``…/ort``), **not** from
``server_models/``. If your shell sets ``STEM_MODELS_DIR=server_models`` for runtime tests,
that would make ``stem_service.config`` point at the partial tree and export would copy the
wrong files or miss ONNX/ORT under ``models_by_type``. We override that for this process.

**Override:** Set ``STEM_EXPORT_MODELS_DIR`` to a different directory name (under the repo
root) only if your full weights live outside ``models/`` (default: ``models``).

**Workflow:** Populate ``models/`` from ``models/models_by_type``, ``Demucs_Models/``, etc.,
run ``python scripts/export_server_models.py``, then ship ``server_models/`` and set
``STEM_MODELS_DIR=server_models`` on the host/container.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

_root = Path(__file__).resolve().parent.parent

# Import stem_service *after* pinning the models root used for resolution.
_export_src = (os.environ.get("STEM_EXPORT_MODELS_DIR") or "models").strip() or "models"
os.environ["STEM_MODELS_DIR"] = _export_src

sys.path.insert(0, str(_root))

from stem_service import config
from stem_service.mdx_onnx import resolve_mdx_model_path
from stem_service.routing.model_bag import _KUIELAB_B_BAG

# Logical ONNX names for kuielab B four-stem bag (see model_bag.select_4stem_bag).
KUIELAB_B_ONNX: list[str] = list(_KUIELAB_B_BAG.values())

LAYOUT_NOTE = (
    "Weights are grouped by file type under models_by_type/. "
    "Tier-1 MDX models export as .ort when an ORT conversion exists (models_by_type/ort/). "
    "Kuielab 4-stem and other ONNX-only checkpoints stay under models_by_type/onnx/. "
    "Runtime resolves logical *.onnx names to either format. "
    "Set STEM_MODELS_DIR=server_models on the stem container."
)


@dataclass(frozen=True)
class ExportItem:
    path: Path
    role: str
    pipeline: str
    logical_onnx: str | None = None
    required: bool = True


def _mdx_items(
    declared_onnx_names: list[str],
    *,
    role: str,
    pipeline: str,
    required: bool,
) -> list[ExportItem]:
    items: list[ExportItem] = []
    for name in declared_onnx_names:
        for path in _mdx_and_runtime_paths([name]):
            items.append(
                ExportItem(
                    path=path,
                    role=role,
                    pipeline=pipeline,
                    logical_onnx=name,
                    required=required,
                )
            )
    return items


def _dedupe(paths: list[Path | None]) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for p in paths:
        if p is None:
            continue
        try:
            r = p.resolve()
        except OSError:
            continue
        if r.is_file() and r not in seen:
            seen.add(r)
            out.append(p)
    return out


def _mdx_and_runtime_paths(declared_onnx_names: list[str]) -> list[Path]:
    """For each logical ``*.onnx`` name, add resolved runtime path (prefers ``.ort``) and siblings."""
    out: list[Path] = []
    for name in declared_onnx_names:
        declared = config.resolve_models_root_file(name)
        resolved = resolve_mdx_model_path(declared)
        if resolved is not None and resolved.is_file():
            out.append(resolved)
        elif declared.is_file():
            out.append(declared)
        ort = declared.with_suffix(".ort")
        typed_ort = config.MODELS_BY_TYPE_DIR / "ort" / ort.name
        for p in (ort, typed_ort):
            if p.is_file():
                out.append(p)
    return _dedupe(out)


def main() -> None:
    src_root = (config.REPO_ROOT / _export_src).resolve()
    print(f"Export source (STEM_MODELS_DIR for this run): {_export_src} -> {src_root}")

    target_dir = _root / "server_models"
    print(f"Exporting server models to: {target_dir}")

    if target_dir.exists():
        print("Wiping existing server_models directory...")
        shutil.rmtree(target_dir, ignore_errors=True)

    target_dir.mkdir(parents=True, exist_ok=True)

    export_items: list[ExportItem] = []

    # 1. 2-Stem MDX vocal
    export_items.extend(
        _mdx_items(
            ["UVR_MDXNET_3_9662.onnx", "UVR_MDXNET_KARA.onnx"],
            role="vocal separation",
            pipeline="2-stem",
            required=True,
        )
    )
    export_items.extend(
        _mdx_items(
            ["Kim_Vocal_2.onnx"],
            role="vocal separation (fallback)",
            pipeline="2-stem",
            required=False,
        )
    )

    # Instrumental tier
    export_items.extend(
        _mdx_items(
            ["UVR-MDX-NET-Inst_HQ_5.onnx"],
            role="instrumental separation",
            pipeline="2-stem",
            required=False,
        )
    )

    # 4-stem MDX: kuielab B
    export_items.extend(
        _mdx_items(
            KUIELAB_B_ONNX,
            role="4-stem MDX (kuielab bag)",
            pipeline="4-stem",
            required=False,
        )
    )

    # UVR per-stem drums/bass
    export_items.extend(
        _mdx_items(
            ["UVR-MDX-NET-Drum.onnx", "UVR-MDX-NET-Bass.onnx"],
            role="4-stem MDX (uvr bag)",
            pipeline="4-stem",
            required=False,
        )
    )

    # 2. HTDemucs fallback
    if config.HTDEMUCS_TH.exists():
        export_items.append(
            ExportItem(
                config.HTDEMUCS_TH,
                role="Demucs 4-stem fallback",
                pipeline="4-stem",
                logical_onnx=None,
                required=True,
            )
        )
    elif config.HTDEMUCS_PTH.exists():
        export_items.append(
            ExportItem(
                config.HTDEMUCS_PTH,
                role="Demucs 4-stem fallback",
                pipeline="4-stem",
                logical_onnx=None,
                required=True,
            )
        )
    else:
        export_items.append(
            ExportItem(
                config.HTDEMUCS_TH,
                role="Demucs 4-stem fallback",
                pipeline="4-stem",
                logical_onnx=None,
                required=True,
            )
        )

    # 4. 4-Stem Demucs ranked checkpoints
    for cfg in config.demucs_speed_4stem_configs():
        export_items.append(
            ExportItem(
                cfg[4],
                role=f"Demucs 4-stem speed ({cfg[0]})",
                pipeline="4-stem",
                required=True,
            )
        )
    for cfg in config.demucs_quality_4stem_configs():
        export_items.append(
            ExportItem(
                cfg[4],
                role=f"Demucs 4-stem quality ({cfg[0]})",
                pipeline="4-stem",
                required=True,
            )
        )

    # 5. SCNet ONNX (optional)
    scnet = config.get_scnet_onnx_path()
    if scnet is not None and scnet.is_file():
        export_items.append(
            ExportItem(
                scnet,
                role="SCNet 4-stem ONNX",
                pipeline="4-stem",
                required=False,
            )
        )

    # Dedupe by resolved file path (keep first role)
    seen_paths: set[Path] = set()
    deduped_items: list[ExportItem] = []
    for item in export_items:
        try:
            key = item.path.resolve()
        except OSError:
            continue
        if key in seen_paths:
            continue
        seen_paths.add(key)
        deduped_items.append(item)

    fatal_errors: list[str] = []
    copied = 0
    manifest_entries: list[dict[str, object]] = []

    def _copy_one(item: ExportItem) -> bool:
        """Copy one file preserving its path relative to MODELS_DIR."""
        nonlocal copied
        file_path = item.path
        required = item.required
        if not file_path or not file_path.exists():
            msg = f"File not found: {file_path}"
            if required:
                fatal_errors.append(msg)
                print(f"ERROR: {msg}")
            else:
                print(f"OPTIONAL missing (skipping): {file_path}")
            return False
        try:
            rel_path = file_path.relative_to(config.MODELS_DIR)
        except ValueError:
            msg = (
                f"File {file_path} is outside {config.MODELS_DIR} — "
                "cannot preserve relative path. "
                "Set STEM_EXPORT_MODELS_DIR to the directory that contains this file."
            )
            if required:
                fatal_errors.append(msg)
                print(f"ERROR: {msg}")
            else:
                print(f"OPTIONAL out-of-tree (skipping): {file_path}")
            return False
        dest_path = target_dir / rel_path
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Copying {rel_path}  [{item.pipeline} / {item.role}]")
        shutil.copy2(file_path, dest_path)
        copied += 1
        manifest_entries.append(
            {
                "relative_path": rel_path.as_posix(),
                "format": rel_path.suffix.lower().lstrip("."),
                "pipeline": item.pipeline,
                "role": item.role,
                "logical_onnx": item.logical_onnx,
                "required": item.required,
                "size_bytes": dest_path.stat().st_size,
            }
        )
        return True

    for item in deduped_items:
        _copy_one(item)

    # 6. model_data/ — optional UVR JSON metadata for tooling (see docs/MODEL-PARAMS.md).
    model_data_src = config.MDX_NET_MODELS_DIR / "model_data"
    if not model_data_src.is_dir():
        alt = config.MODELS_DIR / "model_data"
        if alt.is_dir():
            model_data_src = alt
    if model_data_src.is_dir():
        try:
            model_data_dst = target_dir / model_data_src.relative_to(config.MODELS_DIR)
        except ValueError:
            model_data_dst = target_dir / "MDX_Net_Models" / "model_data"
        n_src = sum(1 for _ in model_data_src.rglob("*") if _.is_file())
        print(f"Copying {model_data_dst.relative_to(target_dir)}/ ({n_src} files)...")
        shutil.copytree(model_data_src, model_data_dst, dirs_exist_ok=True)
        copied += sum(1 for _ in model_data_dst.rglob("*") if _.is_file())
    else:
        print("OPTIONAL missing (skipping): MDX_Net_Models/model_data/")

    total_mb = (
        sum(f.stat().st_size for f in target_dir.rglob("*") if f.is_file()) / (1024 * 1024)
    )

    if fatal_errors:
        print(f"\nExport FAILED — {len(fatal_errors)} required file(s) missing or out-of-tree:")
        for err in fatal_errors:
            print(f"  - {err}")
        print("Populate models/ from your stem-models bank and re-run.")
        sys.exit(1)

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "generated_at": generated_at,
        "source_tree": _export_src,
        "runtime_env": "STEM_MODELS_DIR=server_models",
        "layout_note": LAYOUT_NOTE,
        "files": sorted(manifest_entries, key=lambda e: str(e["relative_path"])),
    }
    manifest_path = target_dir / "MANIFEST.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    layout_lines = [
        "Burnt Beats server_models layout",
        f"Generated: {generated_at}",
        f"Source: {_export_src}/",
        "",
        LAYOUT_NOTE,
        "",
        "Folder guide:",
        "  models_by_type/ort/   — ORT runtime (preferred for tier-1 MDX vocal/inst when converted)",
        "  models_by_type/onnx/  — ONNX runtime (kuielab 4-stem, any model without ORT conversion)",
        "  models_by_type/th/    — Demucs PyTorch checkpoints",
        "  scnet-models/         — SCNet 4-stem ONNX (optional)",
        "  model_data/           — UVR metadata for tooling (optional)",
        "",
        "Exported files:",
    ]
    for entry in manifest["files"]:
        req = "required" if entry["required"] else "optional"
        logical = entry.get("logical_onnx") or "-"
        layout_lines.append(
            f"  {entry['relative_path']}"
            f"  ({entry['format']}, {entry['pipeline']}, {req}, logical={logical})"
        )
    layout_lines.extend(
        [
            "",
            "After deploy: python scripts/check_models.py  (with STEM_MODELS_DIR=server_models)",
            "Full inventory: see MANIFEST.json in this folder.",
        ]
    )
    (target_dir / "LAYOUT.txt").write_text("\n".join(layout_lines) + "\n", encoding="utf-8")

    print(f"\nSuccessfully exported {copied} files ({total_mb:.2f} MB) to {target_dir}")
    print(f"Wrote {manifest_path.name} and LAYOUT.txt")
    print("\nOn the server or in compose, point the stem service at this folder:")
    print("  STEM_MODELS_DIR=server_models")
    print("\nKeep populating the full repo `models/` (including `models/models_by_type/`) from")
    print("your stem-models bank or `scripts/sync_models_from_model_testing.ps1`; export reads")
    print("that tree, not `server_models`, when building the payload.")


if __name__ == "__main__":
    main()
