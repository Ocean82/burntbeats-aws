#!/usr/bin/env python3
"""
Move loose weight files from ``models/`` into ``models/models_by_type/<type>/``.

- If ``models_by_type/<type>/<name>`` already exists and has the **same size** as the
  root copy, **delete** the root duplicate.
- Otherwise **move** the root file into ``models_by_type`` (creating the subfolder).

**Never moves** (stay at ``models/`` root or in place):

- Directories (``Demucs_Models``, ``MDX_Net_Models``, ``scnet_models``, …)
- ``htdemucs.pth`` / ``htdemucs.th`` (stem service uses ``--repo`` = ``models/``)
- ``INVENTORY.md``, ``.gitkeep``, ``models/`` ``requirements.txt``
- This script only scans **immediate children** of ``models/``, not nested dirs.

Non-weight root files (``.json``, ``gitattributes*``, ``model-weights-metrics.md``) go to
``models/model_resources/`` when not duplicates.

Usage::

  python scripts/organize_models_into_models_by_type.py
  python scripts/organize_models_into_models_by_type.py --apply

"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO_ROOT / "models"
BY_TYPE = MODELS_DIR / "models_by_type"
MODEL_RESOURCES = MODELS_DIR / "model_resources"

SKIP_NAMES = frozenset(
    {
        ".gitkeep",
        "INVENTORY.md",
        "requirements.txt",
        "htdemucs.pth",
        "htdemucs.th",
    }
)


def _subdir_for_file(name: str) -> str | None:
    lower = name.lower()
    if lower.endswith(".onnx.data"):
        return "onnx"
    ext = Path(name).suffix.lower()
    return {
        ".onnx": "onnx",
        ".ort": "ort",
        ".ckpt": "ckpt",
        ".pth": "pth",
        ".th": "th",
        ".safetensors": "safetensors",
        ".yaml": "ckpt",
    }.get(ext)


def _typed_target(name: str) -> tuple[Path, str] | None:
    if name.endswith(".required_operators_and_types.config") or name.endswith(
        ".required_operators_and_types.with_runtime_opt.config"
    ):
        return BY_TYPE / "ort" / name, "ort"
    sub = _subdir_for_file(name)
    if sub:
        return BY_TYPE / sub / name, sub
    return None


def _resource_target(name: str) -> Path | None:
    lower = name.lower()
    if lower.endswith(".json") or lower.startswith("gitattributes"):
        return MODEL_RESOURCES / name
    if lower.endswith(".zip"):
        return MODEL_RESOURCES / name
    if name == "model-weights-metrics.md":
        return MODEL_RESOURCES / name
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Perform moves/deletes (default is dry-run)",
    )
    args = ap.parse_args()
    apply = args.apply

    if not MODELS_DIR.is_dir():
        print(f"Missing {MODELS_DIR}", file=sys.stderr)
        return 1
    BY_TYPE.mkdir(parents=True, exist_ok=True)
    MODEL_RESOURCES.mkdir(parents=True, exist_ok=True)

    actions: list[str] = []

    for entry in sorted(MODELS_DIR.iterdir(), key=lambda p: p.name.lower()):
        if not entry.is_file():
            continue
        name = entry.name
        if name in SKIP_NAMES:
            continue

        typed = _typed_target(name)
        if typed is not None:
            dest_dir, kind = typed[0].parent, typed[1]
            dest = typed[0]
            dest_dir.mkdir(parents=True, exist_ok=True)
            src_sz = entry.stat().st_size
            if dest.is_file():
                if dest.stat().st_size == src_sz:
                    actions.append(f"DELETE duplicate root (same size as {kind}/): {name}")
                    if apply:
                        entry.unlink()
                else:
                    actions.append(
                        f"SKIP size mismatch root vs {kind}/: {name} "
                        f"({src_sz} vs {dest.stat().st_size})"
                    )
                continue
            actions.append(f"MOVE -> models_by_type/{kind}/: {name}")
            if apply:
                shutil.move(str(entry), str(dest))
            continue

        res = _resource_target(name)
        if res is not None:
            res.parent.mkdir(parents=True, exist_ok=True)
            if res.is_file():
                if res.stat().st_size == entry.stat().st_size:
                    actions.append(f"DELETE duplicate root (same size as model_resources/): {name}")
                    if apply:
                        entry.unlink()
                else:
                    actions.append(
                        f"SKIP size mismatch root vs model_resources/: {name}"
                    )
                continue
            actions.append(f"MOVE -> model_resources/: {name}")
            if apply:
                shutil.move(str(entry), str(res))
            continue

        if _subdir_for_file(name) is None and not _resource_target(name):
            actions.append(f"SKIP (no rule): {name}")

    mode = "APPLY" if apply else "DRY-RUN"
    print(f"{mode}: {len(actions)} action(s)")
    for line in actions:
        print(line)
    if not apply and actions:
        print("Re-run with --apply to execute.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
