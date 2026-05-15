"""
Bug condition exploration tests for Phase 2: Audio Fidelity Improvements.

These tests encode the EXPECTED (correct) behavior. They are designed to FAIL
on unfixed code, proving the bugs exist. After the fix, they should PASS.

Bug 3: No TPDF dithering applied before 16-bit PCM writes
Bug 4: ONNX output not resampled back to original sample rate
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import soundfile as sf

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_bug3_dithering_applied_before_pcm16_write():
    """
    Bug 3: When writing audio to PCM_16, TPDF dithering should be applied
    to decorrelate quantization noise.

    We test this by checking that the stem_service has a write_wav_16bit
    utility that applies dithering. On unfixed code, this module doesn't exist.

    EXPECTED: This test FAILS on unfixed code (no audio_utils module).
    After fix: This test PASSES.
    """
    try:
        from stem_service.audio_utils import write_wav_16bit, apply_tpdf_dither
    except ImportError:
        raise AssertionError(
            "Bug 3 confirmed: stem_service.audio_utils module does not exist. "
            "No TPDF dithering utility is available."
        )

    # Verify dithering actually changes the signal (adds noise)
    # Generate a very quiet signal where dithering matters most
    sr = 44100
    duration = 0.1  # 100ms
    t = np.linspace(0, duration, int(sr * duration), endpoint=False, dtype=np.float32)
    # -90 dBFS sine wave (very quiet — quantization noise is significant here)
    amplitude = 10 ** (-90 / 20)  # ~0.0000316
    quiet_sine = (amplitude * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)
    stereo = np.column_stack([quiet_sine, quiet_sine])

    # Apply dithering
    dithered = apply_tpdf_dither(stereo, bit_depth=16)

    # Dithered signal should differ from original (noise added)
    assert not np.array_equal(stereo, dithered), (
        "Dithering should modify the signal (add noise)"
    )

    # Mean should be approximately preserved (dither is zero-mean)
    assert abs(np.mean(dithered) - np.mean(stereo)) < 1e-5, (
        "Dithering should preserve the signal mean"
    )


def test_bug4_onnx_output_preserves_original_sample_rate():
    """
    Bug 4: When input audio is 48 kHz, the ONNX inference output should be
    resampled back to 48 kHz (not left at 44.1 kHz).

    We mock the ONNX session and verify the output file has the correct sample rate.

    EXPECTED: This test FAILS on unfixed code (output is 44100 Hz).
    After fix: This test PASSES.
    """
    import torch

    # Create a 48 kHz stereo test signal
    sr_original = 48000
    duration = 0.5  # 500ms
    n_samples = int(sr_original * duration)
    test_audio = np.random.randn(n_samples, 2).astype(np.float32) * 0.1

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input_48k.wav"
        output_path = Path(tmpdir) / "output.wav"

        # Write 48 kHz input
        sf.write(str(input_path), test_audio, sr_original)

        # Mock the ONNX session to return a passthrough (identity separation)
        mock_session = MagicMock()
        mock_session.get_inputs.return_value = [MagicMock(name="input")]

        # The model returns the same spectrogram it receives (identity)
        def mock_run(output_names, input_dict):
            return [list(input_dict.values())[0]]

        mock_session.run = mock_run

        # Mock _get_config to return valid MDX params
        # n_fft=6144, hop=1024, dim_f=2048, dim_t=256, compensate=1.0
        mock_config = (6144, 1024, 2048, 256, 1.0)

        with patch("stem_service.mdx.inference._onnx_session", return_value=mock_session), \
             patch("stem_service.mdx.inference._get_config", return_value=mock_config):

            from stem_service.mdx.inference import _run_mdx_onnx

            fake_model = Path("/fake/model.onnx")
            result = _run_mdx_onnx(input_path, output_path, fake_model)

        if result is None:
            # If inference failed for other reasons, skip this check
            raise AssertionError(
                "ONNX inference returned None — test setup issue, not bug confirmation"
            )

        # Read the output and check sample rate
        assert output_path.exists(), "Output file was not created"
        info = sf.info(str(output_path))
        assert info.samplerate == sr_original, (
            f"Bug 4 confirmed: output sample rate is {info.samplerate} "
            f"but should be {sr_original} (matching input)"
        )
