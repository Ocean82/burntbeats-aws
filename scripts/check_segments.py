#!/usr/bin/env python3
"""
Test each pipeline segment so models load and run correctly.

Intended for WSL or Linux. Run from repo root with venv active:

  bash scripts/check-segments.sh

Or from inside WSL/Linux:
  source .venv/bin/activate && python scripts/check_segments.py

From Windows (with WSL installed): wsl bash scripts/check-segments.sh

Creates a minimal test WAV in tmp/segment_test/ and runs VAD, phase inversion, Stage 1, Stage 2.
"""

from __future__ import annotations

import sys
from pathlib import Path

def _log(*args: object, **kwargs: object) -> None:
    kwargs.setdefault("flush", True)
    print(*args, **kwargs)

# Repo root
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

TEST_DIR = ROOT / "tmp" / "segment_test"
TEST_WAV = TEST_DIR / "test_audio.wav"
SAMPLE_RATE = 44100
DURATION_SEC = 4  # Short enough to be fast, long enough for Demucs


def make_test_wav() -> Path:
    """Create a minimal stereo WAV (silence + light noise so it's valid). Uses stdlib wave to avoid torchcodec."""
    import struct
    import wave

    TEST_DIR.mkdir(parents=True, exist_ok=True)
    num_samples = SAMPLE_RATE * DURATION_SEC
    # Stereo, small amplitude; generate as float then write 16-bit PCM
    import random
    random.seed(42)
    frames = []
    for _ in range(2 * num_samples):
        # ~0.1 amplitude
        s = (random.random() * 2 - 1) * 0.1
        frames.append(struct.pack("<h", max(-32768, min(32767, int(s * 32767)))))
    with wave.open(str(TEST_WAV), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(b"".join(frames))
    return TEST_WAV


def segment_vad() -> bool:
    """VAD pre-trim was removed (Silero is speech-tuned, not music-vocal-tuned)."""
    _log("  [VAD] SKIP (module removed; pre-trim disabled in hybrid pipeline)")
    return True


def segment_phase_inversion() -> bool:
    """Test phase inversion: create_perfect_instrumental with two WAVs."""
    import numpy as np
    import soundfile as sf

    from stem_service.phase_inversion import create_perfect_instrumental

    _log("  [Phase inversion] Creating original + vocal WAVs...", end=" ")
    orig_path = TEST_DIR / "orig.wav"
    vocal_path = TEST_DIR / "vocal.wav"
    out_path = TEST_DIR / "instrumental.wav"
    n = SAMPLE_RATE * 2
    np.random.seed(42)
    orig = (np.random.randn(2, n) * 0.2).astype(np.float32)
    vocal = (np.random.randn(2, n) * 0.1).astype(np.float32)
    sf.write(str(orig_path), orig.T, SAMPLE_RATE)
    sf.write(str(vocal_path), vocal.T, SAMPLE_RATE)
    _log("OK")

    _log("  [Phase inversion] create_perfect_instrumental...", end=" ")
    create_perfect_instrumental(orig_path, vocal_path, out_path)
    if not out_path.exists() or out_path.stat().st_size < 100:
        _log("FAIL (no output)")
        return False
    _log("OK")
    return True


def segment_stage1() -> bool:
    """Test Stage 1: extract_vocals_stage1 (ONNX or Demucs 2-stem fallback)."""
    from stem_service.vocal_stage1 import extract_vocals_stage1

    stage1_out = TEST_DIR / "stage1_out"
    _log("  [Stage 1] vocal extraction (may take 1–3 min on CPU)...", end=" ")
    try:
        vocals_path, inst_path, models_used, inst_src = extract_vocals_stage1(
            TEST_WAV, stage1_out
        )
        if not vocals_path.exists() or vocals_path.stat().st_size < 100:
            _log("FAIL (no vocals file)")
            return False
        _log(f"OK  models={models_used}  instrumental_source={inst_src.value}")
        if inst_path is not None:
            _log(f"    instrumental path: {inst_path}")
        else:
            _log("    instrumental: pending hybrid phase inversion")
        return True
    except Exception as e:
        _log(f"FAIL ({e})")
        return False


def segment_stage2() -> bool:
    """Test Stage 2: run_demucs 4-stem on instrumental (use test WAV as proxy)."""
    from stem_service.split import run_demucs

    stage2_out = TEST_DIR / "stage2_out"
    _log("  [Stage 2] Demucs 4-stem (may take 1–3 min on CPU)...", end=" ")
    try:
        stems = run_demucs(TEST_WAV, stage2_out, stems=4)
        expected = {"vocals", "drums", "bass", "other"}
        got = {s[0] for s in stems}
        if got != expected:
            _log(f"FAIL (got {got})")
            return False
        for _id, p in stems:
            if not p.exists() or p.stat().st_size < 100:
                _log(f"FAIL (missing/small {_id})")
                return False
        _log("OK")
        return True
    except Exception as e:
        _log(f"FAIL ({e})")
        return False


def main() -> int:
    _log("Segment tests (models load + run)")
    _log("Test dir:", TEST_DIR)
    _log()

    make_test_wav()
    _log("Test WAV:", TEST_WAV, f"({DURATION_SEC}s, {SAMPLE_RATE} Hz)")
    _log()

    results: list[tuple[str, bool]] = []

    _log("1. VAD (Silero)")
    results.append(("VAD", segment_vad()))
    _log()

    _log("2. Phase inversion")
    results.append(("Phase inversion", segment_phase_inversion()))
    _log()

    _log("3. Stage 1 (vocal extraction)")
    results.append(("Stage 1", segment_stage1()))
    _log()

    _log("4. Stage 2 (Demucs 4-stem)")
    results.append(("Stage 2", segment_stage2()))
    _log()

    failed = [name for name, ok in results if not ok]
    if failed:
        _log("FAILED:", ", ".join(failed))
        return 1
    _log("All segments OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
