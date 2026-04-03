#!/usr/bin/env python3
"""Verify 2-stem splits."""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from stem_service.hybrid import run_hybrid_2stem

test_wav = ROOT / "tmp" / "stem_split_test" / "test_audio.wav"

print("=== 2-Stem Quality ===")
out_dir = ROOT / "tmp" / "stem_split_test" / "2stem_verify"
out_dir.mkdir(parents=True, exist_ok=True)

start = time.time()
stems, models = run_hybrid_2stem(test_wav, out_dir, prefer_speed=False)
print(f"Done in {time.time() - start:.1f}s")
print("Stems:", [(s[0], s[1].name) for s in stems])
print("Models:", models)

print()
print("=== 2-Stem Speed ===")
out_dir2 = ROOT / "tmp" / "stem_split_test" / "2stem_verify_speed"
out_dir2.mkdir(parents=True, exist_ok=True)

start = time.time()
stems2, models2 = run_hybrid_2stem(test_wav, out_dir2, prefer_speed=True)
print(f"Done in {time.time() - start:.1f}s")
print("Stems:", [(s[0], s[1].name) for s in stems2])
print("Models:", models2)

print()
print("All 2-stem tests completed successfully!")
