#!/usr/bin/env python3
"""Verify all stem WAV files load properly and contain valid audio."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import soundfile as sf
import numpy as np

stem_dirs = [
    ROOT / "tmp" / "stem_split_test" / "2stem_verify" / "stems",
    ROOT / "tmp" / "stem_split_test" / "2stem_verify_speed" / "stems",
    ROOT / "tmp" / "stem_split_test" / "4stem_speed" / "stems",
    ROOT / "tmp" / "stem_split_test" / "4stem_quality" / "stems",
]

all_ok = True
for stem_dir in stem_dirs:
    if not stem_dir.exists():
        print(f"SKIP: {stem_dir.name} - directory not found")
        continue

    print(f"\n=== {stem_dir.name} ===")
    wav_files = sorted(stem_dir.glob("*.wav"))

    if not wav_files:
        print("  No WAV files found")
        continue

    for wav in wav_files:
        try:
            data, sr = sf.read(str(wav), dtype="float64", always_2d=True)

            rms = float((data**2).mean() ** 0.5)
            peak = float(np.abs(data).max())
            duration = len(data) / sr

            print(
                f"  {wav.stem:15} | sr={sr} | dur={duration:.2f}s | "
                f"rms={rms:.4f} | peak={peak:.4f} | "
                f"shape={data.shape}"
            )

            if sr != 44100:
                print(f"    WARNING: Sample rate mismatch!")
                all_ok = False
            if rms < 1e-5:
                print(f"    WARNING: Nearly silent!")
                all_ok = False

        except Exception as e:
            print(f"  {wav.stem}: ERROR - {e}")
            all_ok = False

print()
if all_ok:
    print("All stems loaded successfully!")
else:
    print("Some stems had issues - check warnings above")
