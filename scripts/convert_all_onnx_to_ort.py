#!/usr/bin/env python3
"""
Batch-convert every *.onnx under models/ to ORT (offline build step).

Skips:
  - paths under excluded segments (demucs.onnx-main, .git, …)
  - files where sibling .ort already exists (unless --force)

Usage:
  python scripts/convert_all_onnx_to_ort.py
  python scripts/convert_all_onnx_to_ort.py --dry-run
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EXCLUDE = ("demucs.onnx-main", "node_modules", ".git", "__pycache__")


def _skip_path(p: Path, models_dir: Path, extra_exclude: tuple[str, ...]) -> bool:
    rel = p.relative_to(models_dir)
    for ex in DEFAULT_EXCLUDE + extra_exclude:
        if ex in rel.parts:
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description="Convert all ONNX under models/ to ORT")
    ap.add_argument("--models-dir", type=Path, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="Convert even if .ort exists")
    ap.add_argument("--exclude", action="append", default=[], help="Extra path segment to exclude")
    args = ap.parse_args()

    models_dir = (args.models_dir or (REPO_ROOT / "models")).resolve()
    excl = tuple(args.exclude)

    onnx_files = sorted(
        p
        for p in models_dir.rglob("*.onnx")
        if not _skip_path(p, models_dir, excl)
    )
    log_path = REPO_ROOT / "tmp" / "convert_onnx_to_ort_log.txt"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []

    # Preflight: ORT converter imports `onnx` package.
    try:
        import onnx  # noqa: F401
    except Exception:
        msg = (
            "Missing Python dependency: `onnx`.\n"
            f"Active interpreter: {sys.executable}\n"
            "Install in this venv and retry:\n"
            "  python -m pip install onnx\n"
        )
        summary = "Summary: ok=0 fail=0 skip=0 dry_run=False (preflight blocked)"
        log_path.write_text(msg + "\n" + summary + "\n", encoding="utf-8")
        print(log_path)
        print(msg.strip())
        return 2

    ok_n = fail_n = skip_n = 0
    for p in onnx_files:
        ort = p.with_suffix(".ort")
        if ort.is_file() and not args.force:
            lines.append(f"SKIP (exists) {p.relative_to(REPO_ROOT)}")
            skip_n += 1
            continue
        if args.dry_run:
            lines.append(f"DRY-RUN would convert {p.relative_to(REPO_ROOT)}")
            continue
        cmd = [
            sys.executable,
            "-m",
            "onnxruntime.tools.convert_onnx_models_to_ort",
            str(p),
            "--enable_type_reduction",
        ]
        r = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True)
        if r.returncode == 0:
            lines.append(f"OK {p.relative_to(REPO_ROOT)}")
            ok_n += 1
        else:
            err = (r.stderr or r.stdout or "")[-500:]
            lines.append(f"FAIL {p.relative_to(REPO_ROOT)} :: {err}")
            fail_n += 1

    summary = f"\nSummary: ok={ok_n} fail={fail_n} skip={skip_n} dry_run={args.dry_run}\n"
    log_path.write_text("\n".join(lines) + summary, encoding="utf-8")
    print(log_path)
    print(summary.strip())
    return 0 if fail_n == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
