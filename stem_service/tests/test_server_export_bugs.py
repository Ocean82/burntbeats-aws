"""
Bug condition exploration tests for Phase 3: Server Export Quality.

These tests encode the EXPECTED (correct) behavior. They are designed to FAIL
on unfixed code, proving the bugs exist. After the fix, they should PASS.

Bug 5: scipy.signal.resample smears transients (replaced by torchaudio)
Bug 6: Hard clipping in phase_inversion destroys peaks
Bug 7: Non-deterministic reverb IR generation
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_bug6_phase_inversion_uses_soft_limiting():
    """
    Bug 6: When phase inversion produces values outside [-1.0, 1.0],
    the system should use soft limiting (not hard clipping).

    Hard clipping creates a discontinuity in the derivative at the clip point.
    Soft limiting (tanh-based) produces a smooth curve.

    EXPECTED: This test FAILS on unfixed code (hard clipping produces discontinuity).
    After fix: This test PASSES.
    """
    # Import the function that does the limiting
    from stem_service.phase_inversion import create_perfect_instrumental
    import tempfile
    import soundfile as sf

    # Create test signals where orig - vocal produces values at ±1.1
    sr = 44100
    n_samples = 1000
    # Original signal at 1.0 amplitude
    orig = np.ones((2, n_samples), dtype=np.float32) * 0.6
    # Vocal signal at -0.5 (so orig - vocal = 1.1, exceeding 1.0)
    vocal = np.ones((2, n_samples), dtype=np.float32) * -0.5

    with tempfile.TemporaryDirectory() as tmpdir:
        orig_path = Path(tmpdir) / "orig.wav"
        vocal_path = Path(tmpdir) / "vocal.wav"
        output_path = Path(tmpdir) / "instrumental.wav"

        sf.write(str(orig_path), orig.T, sr)
        sf.write(str(vocal_path), vocal.T, sr)

        create_perfect_instrumental(orig_path, vocal_path, output_path)

        # Read the output
        result, _ = sf.read(str(output_path), dtype="float32", always_2d=True)

        # All values should be within [-1.0, 1.0]
        assert np.all(result <= 1.0) and np.all(result >= -1.0), (
            "Output should be within [-1.0, 1.0]"
        )

        # The key test: soft limiting should NOT produce the exact value 1.0
        # for inputs that would exceed 1.0. Hard clipping produces exactly 1.0.
        # Soft limiting (tanh) produces a value < 1.0 (asymptotically approaching).
        max_val = float(np.max(result))

        # With orig=0.6 and vocal=-0.5, subtraction gives 1.1.
        # Hard clipping would give exactly 1.0 (or very close due to PCM_16 quantization).
        # Soft limiting with threshold=0.9 should give something between 0.9 and 1.0
        # but NOT exactly 1.0.
        # Due to PCM_16 quantization, we check that the max is less than 0.999
        # (soft limit of 1.1 with threshold=0.9 gives ~0.9 + 0.1*tanh(2) ≈ 0.996)
        assert max_val < 0.999, (
            f"Bug 6 confirmed: max output value is {max_val:.6f}, indicating hard clipping. "
            f"Soft limiting should produce a value < 0.999 for input of 1.1"
        )


def test_bug7_reverb_ir_is_deterministic():
    """
    Bug 7: build_synthetic_reverb_ir should produce identical output
    when called with the same parameters.

    EXPECTED: This test FAILS on unfixed code (unseeded RNG).
    After fix: This test PASSES.
    """
    from stem_service.server_export import build_synthetic_reverb_ir

    ir1 = build_synthetic_reverb_ir(44100, duration_sec=1.8)
    ir2 = build_synthetic_reverb_ir(44100, duration_sec=1.8)

    assert np.array_equal(ir1, ir2), (
        "Bug 7 confirmed: build_synthetic_reverb_ir produces different output "
        "on consecutive calls with identical parameters. Should be deterministic."
    )
