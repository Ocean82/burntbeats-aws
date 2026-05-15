"""
Preservation property tests for Phase 1: Quality Logic Fixes.

These tests encode behavior that MUST remain unchanged after the fix.
They should PASS on both unfixed and fixed code.

Preservation 3.1: Speed mode (prefer_speed=True) continues to use onnx_overlap = 0.5
Preservation 3.2: Explicit USE_DEMUCS_SHIFTS_0=1 in env continues to force shifts=0
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_preservation_speed_mode_uses_05_overlap():
    """
    Preservation 3.1: When prefer_speed=True, onnx_overlap should always be 0.5
    regardless of model_tier. This must remain unchanged after the fix.
    """
    captured_overlap = {}

    def mock_run_vocal_onnx(input_path, output_path, overlap=0.75, **kwargs):
        captured_overlap["value"] = overlap
        return output_path

    # Reload the module to ensure clean state in CI where test ordering matters
    import stem_service.vocal_stage1 as vs1_mod
    importlib.reload(vs1_mod)

    with patch.object(vs1_mod, "run_vocal_onnx", side_effect=mock_run_vocal_onnx), \
         patch.object(vs1_mod, "resolve_single_vocal_onnx") as mock_resolve, \
         patch.object(vs1_mod, "vocal_onnx_allowed_for_service", return_value=True), \
         patch.object(vs1_mod, "audio_separator_2stem_enabled", return_value=False), \
         patch.object(vs1_mod, "resolve_declared_vocal_onnx_path", return_value=None):

        fake_model = Path("/fake/UVR_MDXNET_3_9662.onnx")
        mock_resolve.return_value = fake_model

        fake_input = Path("/fake/input.wav")
        fake_output = Path("/fake/output")

        # Test with multiple model_tier values — speed mode should always use 0.5
        for tier in ("fast", "balanced", "quality"):
            captured_overlap.clear()
            try:
                vs1_mod.extract_vocals_stage1(
                    fake_input,
                    fake_output,
                    prefer_speed=True,
                    model_tier=tier,
                )
            except Exception:
                pass

            assert "value" in captured_overlap, (
                f"run_vocal_onnx was never called for tier={tier}"
            )
            assert captured_overlap["value"] == 0.5, (
                f"Speed mode overlap should be 0.5 for tier={tier}, "
                f"got {captured_overlap['value']}"
            )


def test_preservation_explicit_shifts_0_env_var():
    """
    Preservation 3.2: When USE_DEMUCS_SHIFTS_0=1 is explicitly set in the
    environment, the system should force shifts=0. This must remain unchanged.
    """
    env_with_shifts_0 = os.environ.copy()
    env_with_shifts_0["USE_DEMUCS_SHIFTS_0"] = "1"

    with patch.dict(os.environ, env_with_shifts_0, clear=True):
        import stem_service.config.device as device_mod
        importlib.reload(device_mod)
        result = device_mod.USE_DEMUCS_SHIFTS_0

    assert result is True, (
        f"Explicit USE_DEMUCS_SHIFTS_0=1 should force True, got {result}"
    )


def test_preservation_explicit_shifts_0_true_variants():
    """
    Preservation 3.2 extended: All truthy string variants should work.
    """
    import stem_service.config.device as device_mod

    for val in ("1", "true", "yes"):
        env_copy = os.environ.copy()
        env_copy["USE_DEMUCS_SHIFTS_0"] = val

        with patch.dict(os.environ, env_copy, clear=True):
            importlib.reload(device_mod)
            result = device_mod.USE_DEMUCS_SHIFTS_0

        assert result is True, (
            f"USE_DEMUCS_SHIFTS_0={val!r} should evaluate to True, got {result}"
        )
