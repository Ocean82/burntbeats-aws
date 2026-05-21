#!/usr/bin/env python3
"""Build patch blocks: project keys/lines missing on server copies."""
from pathlib import Path


def parse_env_entries(path: Path) -> dict[str, list[str]]:
    """Map env key -> list of source lines (active or commented template)."""
    if not path.exists():
        return {}
    entries: dict[str, list[str]] = {}
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        s = line.strip()
        if not s:
            continue
        key = None
        is_active = False
        if s.startswith("#") and "=" in s[1:]:
            inner = s.lstrip("#").strip()
            if "=" in inner:
                key = inner.split("=", 1)[0].strip()
        elif "=" in s and not s.startswith("#"):
            key = s.split("=", 1)[0].strip()
            is_active = True
        if key:
            entries.setdefault(key, []).append(line)
            entries[key + ("__active" if is_active else "__comment")] = [line]
    return entries


def active_keys(path: Path) -> set[str]:
    keys = set()
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if "=" in s:
            keys.add(s.split("=", 1)[0].strip())
    return keys


def all_documented_keys(example: Path) -> set[str]:
    keys = set()
    for line in example.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#") and "=" in s[1:]:
            inner = s.lstrip("#").strip()
            if "=" in inner:
                keys.add(inner.split("=", 1)[0].strip())
        elif "=" in s and not s.startswith("#"):
            keys.add(s.split("=", 1)[0].strip())
    return keys


def extract_key_block(text: str, key: str) -> list[str]:
    """Grab contiguous block: comment lines above + key line."""
    lines = text.splitlines()
    hits = [i for i, l in enumerate(lines) if _line_has_key(l, key)]
    if not hits:
        return []
    i = hits[0]
    start = i
    while start > 0 and (
        lines[start - 1].strip().startswith("#")
        and "=" not in lines[start - 1].strip().lstrip("#").strip().split("=", 1)[0] + "="
        or lines[start - 1].strip().startswith("#")
        and not _line_has_key(lines[start - 1], key)
    ):
        prev = lines[start - 1].strip()
        if prev.startswith("#") and "=" in prev.lstrip("#"):
            pk = prev.lstrip("#").strip().split("=", 1)[0].strip()
            if pk and pk != key:
                break
        start -= 1
    end = i + 1
    while end < len(lines) and lines[end].strip().startswith("#") and "=" not in lines[end]:
        end += 1
    return lines[start:end]


def _line_has_key(line: str, key: str) -> bool:
    s = line.strip()
    if s.startswith(key + "="):
        return True
    if s.startswith("#") and s.lstrip("#").strip().startswith(key + "="):
        return True
    return False


root = Path(__file__).resolve().parents[1]
sync = root / ".server-sync"

pairs = [
    ("frontend/.env.example", root / "frontend/.env.example", sync / "frontend__.env.example"),
    ("backend/.env.example", root / "backend/.env.example", sync / "backend__.env.example"),
    ("midi_service/.env.example", root / "midi_service/.env.example", None),
]

for label, proj, srv in pairs:
    proj_text = proj.read_text(encoding="utf-8-sig")
    srv_keys = all_documented_keys(srv) if srv and srv.exists() else set()
    proj_keys = all_documented_keys(proj)
    missing = sorted(proj_keys - srv_keys)
    print(f"\n# {label} — add {len(missing)} keys")
    for k in missing:
        block = extract_key_block(proj_text, k)
        if block:
            print("\n".join(block))
            print()

# .env active key gaps (from .env.example only)
env_pairs = [
    ("frontend/.env", root / "frontend/.env.example", sync / "frontend__.env"),
    ("backend/.env", root / "backend/.env.example", sync / "backend__.env"),
    ("root/.env", root / ".env.example", None),
]

for label, example, srv in env_pairs:
    if not srv or not srv.exists():
        continue
    doc = all_documented_keys(example)
    have = active_keys(srv)
    missing = sorted(doc - have)
    print(f"\n# {label} — active .env missing {len(missing)} documented keys")
    for k in missing:
        block = extract_key_block(example.read_text(encoding="utf-8-sig"), k)
        if block:
            print("\n".join(block))
            print()
