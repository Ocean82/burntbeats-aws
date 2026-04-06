"""
Regenerate stem_service/requirements.lock.txt from currently installed packages
in the active Python environment.

Usage (from repo root):
    source .venv/bin/activate   # on WSL/Linux/macOS
    python scripts/refresh_stem_requirements_lock.py
"""

from __future__ import annotations

from datetime import date
from importlib import metadata
from pathlib import Path
import re
import sys


REQ_IN = Path("stem_service/requirements.txt")
REQ_OUT = Path("stem_service/requirements.lock.txt")


def parse_requirement_name(line: str) -> str | None:
    s = line.strip()
    if not s or s.startswith("#"):
        return None

    # Drop inline comments.
    s = s.split("#", 1)[0].strip()
    if not s:
        return None

    # Skip pip options.
    if s.startswith("-"):
        return None

    # Remove environment markers/extras/version specs.
    s = s.split(";", 1)[0].strip()
    match = re.match(r"^([A-Za-z0-9_.-]+)", s)
    return match.group(1) if match else None


def main() -> int:
    if not REQ_IN.exists():
        print(f"Missing {REQ_IN}", file=sys.stderr)
        return 1

    names: list[str] = []
    for raw in REQ_IN.read_text(encoding="utf-8").splitlines():
        name = parse_requirement_name(raw)
        if name:
            names.append(name)

    if not names:
        print("No package names found in requirements.txt", file=sys.stderr)
        return 1

    missing: list[str] = []
    lines: list[str] = [
        f"# Generated {date.today().isoformat()} from the active Python environment.",
        "# This file pins direct stem_service dependencies from requirements.txt.",
    ]

    for name in names:
        try:
            version = metadata.version(name)
        except metadata.PackageNotFoundError:
            missing.append(name)
            continue
        lines.append(f"{name}=={version}")

    if missing:
        print(
            "Missing packages in the active environment:\n  - "
            + "\n  - ".join(missing)
            + "\n\nInstall dependencies first (for example: pip install -r stem_service/requirements.txt).",
            file=sys.stderr,
        )
        return 1

    REQ_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {REQ_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
