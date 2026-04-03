#!/usr/bin/env python3
"""Verify 4-stem splits with timeout."""

import sys
import time
import signal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def timeout_handler(signum, frame):
    raise TimeoutError("Test timed out!")


from stem_service.split import run_demucs, copy_stems_to_flat_dir

test_wav = ROOT / "tmp" / "stem_split_test" / "test_audio.wav"

print("=== 4-Stem Speed (htdemucs only) ===")
out_dir = ROOT / "tmp" / "stem_split_test" / "4stem_speed"
out_dir.mkdir(parents=True, exist_ok=True)

signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(120)  # 2 min timeout

start = time.time()
try:
    stem_files = run_demucs(test_wav, out_dir, stems=4, prefer_speed=True)
    flat_dir = out_dir / "stems"
    stems = copy_stems_to_flat_dir(stem_files, flat_dir)
    print(f"Done in {time.time() - start:.1f}s")
    print("Stems:", [(s[0], s[1].name) for s in stems])
except TimeoutError as e:
    print(f"TIMEOUT: {e}")
except Exception as e:
    print(f"ERROR: {e}")
finally:
    signal.alarm(0)

print()
print("=== 4-Stem Quality (demucs extra bag) ===")
out_dir2 = ROOT / "tmp" / "stem_split_test" / "4stem_quality"
out_dir2.mkdir(parents=True, exist_ok=True)

signal.alarm(180)  # 3 min timeout for quality

start = time.time()
try:
    stem_files2 = run_demucs(test_wav, out_dir2, stems=4, prefer_speed=False)
    flat_dir2 = out_dir2 / "stems"
    stems2 = copy_stems_to_flat_dir(stem_files2, flat_dir2)
    print(f"Done in {time.time() - start:.1f}s")
    print("Stems:", [(s[0], s[1].name) for s in stems2])
except TimeoutError as e:
    print(f"TIMEOUT: {e}")
except Exception as e:
    print(f"ERROR: {e}")
finally:
    signal.alarm(0)

print("\n4-stem tests completed!")
