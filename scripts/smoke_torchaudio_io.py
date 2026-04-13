#!/usr/bin/env python3
"""CI smoke: ensure torchaudio can load a WAV (avoids TorchCodec-only stacks)."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))


def main() -> int:
    from stem_service.runtime_info import verify_torchaudio_can_load_wav

    try:
        verify_torchaudio_can_load_wav()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    print("torchaudio I/O smoke OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
