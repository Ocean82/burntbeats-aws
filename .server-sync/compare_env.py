#!/usr/bin/env python3
"""Compare project vs server env keys."""
from pathlib import Path


def parse_env(path: Path) -> tuple[str | None, set[str]]:
    if not path.exists():
        return None, set()
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    keys: set[str] = set()
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#") and "=" in s[1:]:
            inner = s.lstrip("#").strip()
            if "=" in inner:
                k = inner.split("=", 1)[0].strip()
                if k:
                    keys.add(k)
            continue
        if s.startswith("#"):
            continue
        if "=" in s:
            k = s.split("=", 1)[0].strip()
            if k:
                keys.add(k)
    return text, keys


def get_lines_for_key(text: str, key: str) -> list[str]:
    out = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(key + "=") or stripped.startswith("# " + key + "=") or stripped.startswith("#" + key + "="):
            out.append(line)
        elif stripped.startswith("#") and stripped.lstrip("#").strip().startswith(key + "="):
            out.append(line)
    return out


root = Path(__file__).resolve().parents[1]
sync = root / ".server-sync"

comparisons = [
    ("root .env.example", root / ".env.example", sync / "root__.env.example"),
    ("root .env", None, sync / ".env"),
    ("frontend .env.example", root / "frontend" / ".env.example", sync / "frontend__.env.example"),
    ("frontend .env", root / "frontend" / ".env", sync / "frontend__.env"),
    ("backend .env.example", root / "backend" / ".env.example", sync / "backend__.env.example"),
    ("backend .env", root / "backend" / ".env", sync / "backend__.env"),
    ("stem .env.example", root / "stem_service" / ".env.example", sync / "stem_service__.env.example"),
    ("stem .env", root / "stem_service" / ".env", sync / "stem_service__.env"),
    ("speech .env.example", root / "speech_service" / ".env.example", sync / "speech_service__.env.example"),
    ("midi .env.example", root / "midi_service" / ".env.example", None),
]

for label, proj, srv in comparisons:
    print(f"=== {label} ===")
    proj_text, proj_keys = (None, set()) if proj is None else parse_env(proj)
    if proj:
        if proj.exists():
            print(f"  project: {len(proj_keys)} keys")
        else:
            print("  project: file missing")
    srv_text, srv_keys = (None, set()) if srv is None else parse_env(srv)
    if srv:
        if srv.exists():
            print(f"  server:  {len(srv_keys)} keys")
        else:
            print("  server:  file missing")

    if proj and proj.exists() and srv and srv.exists():
        miss = sorted(proj_keys - srv_keys)
        extra = sorted(srv_keys - proj_keys)
        if miss:
            print(f"  ADD to server ({len(miss)}):")
            for k in miss:
                print(f"    + {k}")
        if extra:
            print(f"  server-only ({len(extra)}):")
            for k in extra[:20]:
                print(f"    ~ {k}")
            if len(extra) > 20:
                print(f"    ... +{len(extra) - 20} more")
        if not miss and not extra:
            print("  keys aligned")
    elif proj and proj.exists() and (srv is None or not srv.exists()):
        print(f"  server missing — need file with {len(proj_keys)} documented keys")
    print()
