#!/usr/bin/env python3
"""
Delete stem job directories older than RETENTION_HOURS (mtime). For cron / Task Scheduler.

Use the same STEM_OUTPUT_DIR as backend and stem_service (see stem_service/.env.example).

  set STEM_OUTPUT_DIR=D:\\burntbeats-aws\\tmp\\stems
  set RETENTION_HOURS=48
  python scripts/cleanup_retention_jobs.py
"""
from __future__ import annotations

import os
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def main() -> int:
    root = repo_root()
    out = Path(os.environ.get("STEM_OUTPUT_DIR", str(root / "tmp" / "stems")))
    hours = float(os.environ.get("RETENTION_HOURS", "48"))
    if not out.exists():
        return 0
    cutoff = datetime.now() - timedelta(hours=hours)
    removed = 0
    for path in out.iterdir():
        if not path.is_dir():
            continue
        mtime = datetime.fromtimestamp(path.stat().st_mtime)
        if mtime < cutoff:
            shutil.rmtree(path, ignore_errors=True)
            removed += 1
    if removed:
        print(f"Removed {removed} job dir(s) older than {hours}h under {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
