#!/usr/bin/env python3
"""
End-to-end test: 2-stem and 4-stem splitting with basic quality checks.
Run from repo root with venv active: python scripts/test_stem_splits.py
Uses same test WAV as check_segments; runs full pipeline (hybrid or demucs_only per STEM_BACKEND)
and validates: output files exist, valid WAV, sane duration, non-silent (RMS threshold).
For subjective quality, listen to tmp/stem_split_test/ after the run.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

TEST_DIR = ROOT / "tmp" / "stem_split_test"
SAMPLE_RATE = 44100
DURATION_SEC = 5  # Slightly longer for more stable Demucs output
MIN_RMS = 1e-5  # Stems should have some signal (reject all-zeros)
DURATION_TOLERANCE = 0.15  # Allow 15% duration drift vs input


def _log(*args: object, **kwargs: object) -> None:
    kwargs.setdefault("flush", True)
    print(*args, **kwargs)


def make_test_wav() -> Path:
    """Create a minimal stereo WAV (noise so separation has something to work on)."""
    import random
    import struct
    import wave

    test_wav = TEST_DIR / "test_audio.wav"
    TEST_DIR.mkdir(parents=True, exist_ok=True)
    num_samples = SAMPLE_RATE * DURATION_SEC
    random.seed(42)
    frames = []
    for _ in range(2 * num_samples):
        s = (random.random() * 2 - 1) * 0.15
        frames.append(struct.pack("<h", max(-32768, min(32767, int(s * 32767)))))
    with wave.open(str(test_wav), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(b"".join(frames))
    return test_wav


def validate_stem_wav(
    path: Path,
    expected_duration_sec: float,
    stem_id: str,
) -> tuple[bool, str]:
    """Check stem WAV: exists, readable, sane duration, non-silent. Returns (ok, message)."""
    if not path.exists():
        return False, f"{stem_id}: file missing"
    if path.stat().st_size < 100:
        return False, f"{stem_id}: file too small"

    try:
        import numpy as np
        import soundfile as sf
    except ImportError:
        return True, f"{stem_id}: exists ({path.stat().st_size} bytes), skip audio checks (no soundfile)"

    try:
        data, sr = sf.read(str(path), dtype="float64", always_2d=True)
    except Exception as e:
        return False, f"{stem_id}: invalid WAV ({e})"

    if sr != SAMPLE_RATE:
        return False, f"{stem_id}: wrong sample rate {sr} (expected {SAMPLE_RATE})"

    duration_sec = len(data) / sr
    if abs(duration_sec - expected_duration_sec) > expected_duration_sec * DURATION_TOLERANCE:
        return False, f"{stem_id}: duration {duration_sec:.2f}s (expected ~{expected_duration_sec:.2f}s)"

    rms = float((data**2).mean() ** 0.5)
    if rms < MIN_RMS:
        return False, f"{stem_id}: effectively silent (RMS={rms:.2e})"

    return True, f"{stem_id}: OK ({duration_sec:.2f}s, RMS={rms:.4f})"


def run_2stem_test(input_path: Path, prefer_speed: bool) -> bool:
    """Run 2-stem split and validate vocals + instrumental."""
    from stem_service.config import STEM_BACKEND
    from stem_service.hybrid import run_hybrid_2stem
    from stem_service.split import copy_stems_to_flat_dir, run_demucs

    out_dir = TEST_DIR / "2stem_speed" if prefer_speed else TEST_DIR / "2stem_quality"
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        if STEM_BACKEND == "hybrid":
            stem_list = run_hybrid_2stem(input_path, out_dir, prefer_speed=prefer_speed)
        else:
            stem_files = run_demucs(input_path, out_dir, stems=2, prefer_speed=prefer_speed)
            flat_dir = out_dir / "stems"
            stem_list = copy_stems_to_flat_dir(stem_files, flat_dir)
    except Exception as e:
        _log("    FAIL (pipeline error):", e)
        return False

    flat_dir = out_dir / "stems"
    expected = {"vocals", "instrumental"}
    got = {s[0] for s in stem_list}
    if got != expected:
        _log("    FAIL: expected stems", expected, "got", got)
        return False

    all_ok = True
    for stem_id, p in stem_list:
        ok, msg = validate_stem_wav(p, DURATION_SEC, stem_id)
        _log("     ", msg)
        if not ok:
            all_ok = False
    return all_ok


def run_4stem_test(input_path: Path, prefer_speed: bool) -> bool:
    """Run 4-stem split and validate vocals, drums, bass, other."""
    from stem_service.config import STEM_BACKEND
    from stem_service.hybrid import run_hybrid_4stem
    from stem_service.split import copy_stems_to_flat_dir, run_demucs

    out_dir = TEST_DIR / "4stem_speed" if prefer_speed else TEST_DIR / "4stem_quality"
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        if STEM_BACKEND == "hybrid":
            stem_list = run_hybrid_4stem(input_path, out_dir, prefer_speed=prefer_speed)
        else:
            stem_files = run_demucs(input_path, out_dir, stems=4, prefer_speed=prefer_speed)
            flat_dir = out_dir / "stems"
            stem_list = copy_stems_to_flat_dir(stem_files, flat_dir)
    except Exception as e:
        _log("    FAIL (pipeline error):", e)
        return False

    expected = {"vocals", "drums", "bass", "other"}
    got = {s[0] for s in stem_list}
    if got != expected:
        _log("    FAIL: expected stems", expected, "got", got)
        return False

    all_ok = True
    for stem_id, p in stem_list:
        ok, msg = validate_stem_wav(p, DURATION_SEC, stem_id)
        _log("     ", msg)
        if not ok:
            all_ok = False
    return all_ok


def main() -> int:
    from stem_service.config import STEM_BACKEND

    _log("Stem split E2E tests (2-stem and 4-stem, quality & speed)")
    _log("Backend:", STEM_BACKEND)
    _log("Output dir:", TEST_DIR)
    _log()

    make_test_wav()
    input_path = TEST_DIR / "test_audio.wav"
    _log("Test WAV:", input_path, f"({DURATION_SEC}s, {SAMPLE_RATE} Hz)")
    _log()

    results: list[tuple[str, bool]] = []

    _log("1. 2-stem (quality mode)")
    results.append(("2-stem quality", run_2stem_test(input_path, prefer_speed=False)))
    _log()

    _log("2. 2-stem (speed mode)")
    results.append(("2-stem speed", run_2stem_test(input_path, prefer_speed=True)))
    _log()

    _log("3. 4-stem (quality mode)")
    results.append(("4-stem quality", run_4stem_test(input_path, prefer_speed=False)))
    _log()

    _log("4. 4-stem (speed mode)")
    results.append(("4-stem speed", run_4stem_test(input_path, prefer_speed=True)))
    _log()

    failed = [name for name, ok in results if not ok]
    if failed:
        _log("FAILED:", ", ".join(failed))
        _log("For subjective quality, listen to stems in:", TEST_DIR)
        return 1
    _log("All stem split tests passed.")
    _log("For subjective quality, listen to stems in:", TEST_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
