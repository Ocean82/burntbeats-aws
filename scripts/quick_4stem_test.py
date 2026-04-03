#!/usr/bin/env python3
"""Quick 4-stem test using Demucs htdemucs directly."""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from stem_service.config import STEM_BACKEND, demucs_extra_available, htdemucs_available
from stem_service.split import run_demucs, copy_stems_to_flat_dir

print("Backend:", STEM_BACKEND)
print("htdemucs available:", htdemucs_available())
print("demucs_extra available:", demucs_extra_available())

test_wav = ROOT / "tmp" / "stem_split_test" / "test_audio.wav"
out_dir = ROOT / "tmp" / "stem_split_test" / "4stem_quick"

print("\nTesting 4-stem with htdemucs (speed mode)...")
start = time.time()
stem_files = run_demucs(test_wav, out_dir, stems=4, prefer_speed=True)
elapsed = time.time() - start
print(f"Done in {elapsed:.1f}s")
print("Stem files:", [(s[0], s[1].name) for s in stem_files])

print("\nTesting 4-stem with htdemucs (quality mode - uses bag if available)...")
out_dir2 = ROOT / "tmp" / "stem_split_test" / "4stem_quality2"
start = time.time()
stem_files2 = run_demucs(test_wav, out_dir2, stems=4, prefer_speed=False)
elapsed = time.time() - start
print(f"Done in {elapsed:.1f}s")
print("Stem files:", [(s[0], s[1].name) for s in stem_files2])
