"""
Validate that stem_service/requirements.lock.txt includes all package names
declared in stem_service/requirements.txt.

This is a name-level drift check (not version constraint validation).
"""

from __future__ import annotations

from pathlib import Path
import re
import sys


REQ_TXT = Path("stem_service/requirements.txt")
REQ_LOCK = Path("stem_service/requirements.lock.txt")


def parse_requirement_name(line: str) -> str | None:
    s = line.strip()
    if not s or s.startswith("#"):
        return None
    s = s.split("#", 1)[0].strip()
    if not s or s.startswith("-"):
        return None
    s = s.split(";", 1)[0].strip()
    match = re.match(r"^([A-Za-z0-9_.-]+)", s)
    return match.group(1).lower() if match else None


def read_names(path: Path) -> set[str]:
    names: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        name = parse_requirement_name(raw)
        if name:
            names.add(name)
    return names


def main() -> int:
    if not REQ_TXT.exists():
        print(f"Missing {REQ_TXT}", file=sys.stderr)
        return 1
    if not REQ_LOCK.exists():
        print(f"Missing {REQ_LOCK}", file=sys.stderr)
        return 1

    txt_names = read_names(REQ_TXT)
    lock_names = read_names(REQ_LOCK)
    missing_in_lock = sorted(txt_names - lock_names)

    if missing_in_lock:
        print(
            "requirements.lock.txt is missing package(s) from requirements.txt:\n  - "
            + "\n  - ".join(missing_in_lock),
            file=sys.stderr,
        )
        print(
            "\nFix: activate your env, install requirements, then run:\n"
            "  python scripts/refresh_stem_requirements_lock.py",
            file=sys.stderr,
        )
        return 1

    print("stem_service requirements.txt and requirements.lock.txt are in sync (name-level).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
