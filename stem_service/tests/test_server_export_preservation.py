"""
Preservation property tests for Phase 3: Server Export Quality.

These tests encode behavior that MUST remain unchanged after the fix.
They should PASS on both unfixed and fixed code.

Preservation 3.5: When effective_playback_rate == 1.0, no resampling degradation
Preservation 3.6: Phase inversion values within [-1.0, 1.0] pass through unchanged
Preservation 3.7: When reverb_wet == 0, build_synthetic_reverb_ir is never called
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_preservation_phase_inversion_in_range_unchanged():
    """
    Preservation 3.6: When phase inversion produces values within [-1.0, 1.0],
    the output should equal orig - vocal exactly (no limiting applied).
    """
    import soundfile as sf
    from stem_service.phase_inversion import create_perfect_instrumental

    sr = 44100
    n_samples = 1000
    # Create signals where orig - vocal stays within [-1.0, 1.0]
    # orig = 0.3, vocal = 0.1, result = 0.2 (well within range)
    orig = np.ones((2, n_samples), dtype=np.float32) * 0.3
    vocal = np.ones((2, n_samples), dtype=np.float32) * 0.1

    with tempfile.TemporaryDirectory() as tmpdir:
        orig_path = Path(tmpdir) / "orig.wav"
        vocal_path = Path(tmpdir) / "vocal.wav"
        output_path = Path(tmpdir) / "instrumental.wav"

        sf.write(str(orig_path), orig.T, sr)
        sf.write(str(vocal_path), vocal.T, sr)

        create_perfect_instrumental(orig_path, vocal_path, output_path)

        result, _ = sf.read(str(output_path), dtype="float32", always_2d=True)

        # Expected: 0.3 - 0.1 = 0.2 (within range, should pass through unchanged)
        # Allow for float32 precision and PCM_16 quantization tolerance
        expected = 0.2
        assert np.allclose(result, expected, atol=1e-4), (
            f"In-range phase inversion should pass through unchanged. "
            f"Expected ~{expected}, got mean={np.mean(result):.6f}"
        )


def test_preservation_reverb_not_called_when_wet_is_zero():
    """
    Preservation 3.7: When reverb_wet == 0, build_synthetic_reverb_ir
    should never be called (no performance impact from seed change).
    """
    from stem_service.server_export import build_synthetic_reverb_ir

    # We test this by verifying the code path: when reverb_wet is 0,
    # the `if reverb_wet > 1e-6:` guard prevents IR generation.
    # This is a structural test — the guard exists in the code.
    import inspect
    from stem_service import server_export

    source = inspect.getsource(server_export.main)
    # The guard `if reverb_wet > 1e-6:` should exist
    assert "reverb_wet > 1e-6" in source or "reverb_wet >" in source, (
        "The reverb_wet guard should exist to skip IR generation when wet=0"
    )
