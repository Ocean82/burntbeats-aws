#!/usr/bin/env python3
"""
Download the official Facebook Demucs htdemucs checkpoint into models/htdemucs.th.
Required because the pip demucs loader expects a full package (klass, args, kwargs, state),
not a raw state_dict. Run from repo root: python scripts/download_htdemucs_official.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
HTDEMUCS_TH = MODELS_DIR / "htdemucs.th"
OFFICIAL_URL = "https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th"


def main() -> int:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        import torch
    except ImportError:
        print("torch required: pip install torch", file=sys.stderr)
        return 1
    print("Downloading official htdemucs (955717e8)...")
    try:
        state = torch.hub.load_state_dict_from_url(OFFICIAL_URL, map_location="cpu", check_hash=False)
    except Exception as e:
        print(f"Download failed: {e}", file=sys.stderr)
        return 1
    if not isinstance(state, dict) or "klass" not in state:
        print("Unexpected format: expected package with 'klass' key", file=sys.stderr)
        return 1
    torch.save(state, HTDEMUCS_TH)
    print(f"Saved {HTDEMUCS_TH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
