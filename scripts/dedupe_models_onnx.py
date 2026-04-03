#!/usr/bin/env python3
"""
Remove redundant ONNX (and optionally ORT) copies under models/ subfolders when the same
filename exists at models/ root with identical SHA-256 content.

stem_service resolves paths in order: models/<name>, models/mdxnet_models/<name>,
models/MDX_Net_Models/<name> — keeping a single canonical copy at root is enough when
hashes match.

Usage:
  python scripts/dedupe_models_onnx.py           # dry-run (print only)
  python scripts/dedupe_models_onnx.py --apply   # delete duplicates

Requires models/ to exist locally (ignored by git).
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MODELS = REPO_ROOT / "models"
SUBDIRS = ("mdxnet_models", "MDX_Net_Models")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Delete duplicate files (default is dry-run).",
    )
    args = ap.parse_args()

    if not MODELS.is_dir():
        print("No models/ directory — nothing to do.", file=sys.stderr)
        return 0

    removed = 0
    for sub in SUBDIRS:
        subdir = MODELS / sub
        if not subdir.is_dir():
            continue
        for dup in sorted(subdir.glob("*")):
            if not dup.is_file():
                continue
            if dup.suffix.lower() not in (".onnx", ".ort"):
                continue
            root = MODELS / dup.name
            if not root.is_file():
                continue
            try:
                if _sha256(root) != _sha256(dup):
                    print(f"SKIP (different content): {dup.relative_to(MODELS)}")
                    continue
            except OSError as e:
                print(f"ERR {dup}: {e}", file=sys.stderr)
                continue
            rel = dup.relative_to(MODELS)
            if args.apply:
                dup.unlink()
                print(f"REMOVED {rel}")
                removed += 1
            else:
                print(f"would remove {rel} (same as root {dup.name})")

    if not args.apply:
        print("(dry-run; pass --apply to delete)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
