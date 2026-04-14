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

import os
import shutil
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent

# Import stem_service *after* pinning the models root used for resolution.
_export_src = (os.environ.get("STEM_EXPORT_MODELS_DIR") or "models").strip() or "models"
os.environ["STEM_MODELS_DIR"] = _export_src

sys.path.insert(0, str(_root))

from stem_service import config
from stem_service.mdx_onnx import resolve_mdx_model_path


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

    # required_files: missing or out-of-tree → fatal (exit 1).
    # optional_files: missing → warning only, never blocks deploy.
    required_files: list[Path] = []
    optional_files: list[Path] = []

    # 1. 2-Stem MDX vocal (rank 1 + 2 are required; rank 3/4 are quality-tier fallbacks)
    required_files.extend(
        _mdx_and_runtime_paths(["UVR_MDXNET_3_9662.onnx", "UVR_MDXNET_KARA.onnx"])
    )
    optional_files.extend(
        _mdx_and_runtime_paths(["mdx23c_vocal.onnx", "Kim_Vocal_2.onnx"])
    )

    # Instrumental tier
    optional_files.extend(_mdx_and_runtime_paths(["UVR-MDX-NET-Inst_HQ_5.onnx"]))

    # 2. VAD (optional — pipeline degrades gracefully without it)
    optional_files.append(config.SILERO_VAD_ONNX)

    # 3. HTDemucs fallback (required — every 4-stem path ultimately falls back here)
    if config.HTDEMUCS_TH.exists():
        required_files.append(config.HTDEMUCS_TH)
    elif config.HTDEMUCS_PTH.exists():
        required_files.append(config.HTDEMUCS_PTH)
    else:
        required_files.append(config.HTDEMUCS_TH)  # will trigger missing-file error below

    # 4. 4-Stem Demucs ranked checkpoints (required when present in config; absence is fatal
    #    because config.py only lists them when the resolver found the file on disk)
    for cfg in config.demucs_speed_4stem_configs():
        required_files.append(cfg[4])
    for cfg in config.demucs_quality_4stem_configs():
        required_files.append(cfg[4])

    # 5. SCNet ONNX (optional; only used when FOUR_STEM_BACKEND=auto)
    scnet = config.get_scnet_onnx_path()
    if scnet is not None and scnet.is_file():
        optional_files.append(scnet)

    required_files = _dedupe(required_files)
    optional_files = _dedupe(optional_files)

    fatal_errors: list[str] = []
    copied = 0

    def _copy_one(file_path: Path, *, required: bool) -> bool:
        """Copy one file preserving its path relative to MODELS_DIR.
        Returns True on success. On failure, appends to fatal_errors when required=True.
        """
        nonlocal copied
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
        print(f"Copying {rel_path}...")
        shutil.copy2(file_path, dest_path)
        copied += 1
        return True

    for fp in required_files:
        _copy_one(fp, required=True)
    for fp in optional_files:
        _copy_one(fp, required=False)

    # 6. model_data/ — needed by ultra.py (_get_roformer_config) and check_models.py tooling.
    #    Optional: ultra is GPU-only and may not be deployed everywhere.
    model_data_src = config.MDX_NET_MODELS_DIR / "model_data"
    if model_data_src.is_dir():
        model_data_dst = target_dir / "MDX_Net_Models" / "model_data"
        n_src = sum(1 for _ in model_data_src.rglob("*") if _.is_file())
        print(f"Copying MDX_Net_Models/model_data/ ({n_src} files)...")
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

    print(f"\nSuccessfully exported {copied} files ({total_mb:.2f} MB) to {target_dir}")
    print("\nOn the server or in compose, point the stem service at this folder:")
    print("  STEM_MODELS_DIR=server_models")
    print("\nKeep populating the full repo `models/` (including `models/models_by_type/`) from")
    print("your stem-models bank or `scripts/sync_models_from_model_testing.ps1`; export reads")
    print("that tree, not `server_models`, when building the payload.")


if __name__ == "__main__":
    main()
