"""
Bug condition exploration tests for Phase 1: Quality Logic Fixes.

These tests encode the EXPECTED (correct) behavior. They are designed to FAIL
on unfixed code, proving the bugs exist. After the fix, they should PASS.

Bug 1: quality mode overlap override forces 0.5 instead of 0.75
Bug 2: USE_DEMUCS_SHIFTS_0 defaults to True when env var is unset
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_bug1_quality_mode_uses_075_overlap():
    """
    Bug 1: When model_tier='quality' and prefer_speed=False, onnx_overlap
    should be 0.75 for smoother chunk boundaries.

    EXPECTED: This test FAILS on unfixed code (overlap is 0.5 due to override).
    After fix: This test PASSES.
    """
    captured_overlap = {}

    def mock_run_vocal_onnx(
        input_path, output_path, overlap=0.75, **kwargs
    ):
        captured_overlap["value"] = overlap
        # Return a fake path to simulate success
        return output_path

    # Mock all dependencies so extract_vocals_stage1 can run without real models
    with patch("stem_service.vocal_stage1.run_vocal_onnx", side_effect=mock_run_vocal_onnx) as mock_vocal, \
         patch("stem_service.vocal_stage1.resolve_single_vocal_onnx") as mock_resolve, \
         patch("stem_service.vocal_stage1.vocal_onnx_allowed_for_service", return_value=True), \
         patch("stem_service.vocal_stage1.audio_separator_2stem_enabled", return_value=False):

        # Make resolve return a fake model path
        fake_model = Path("/fake/Kim_Vocal_2.onnx")
        mock_resolve.return_value = fake_model

        from stem_service.vocal_stage1 import extract_vocals_stage1

        fake_input = Path("/fake/input.wav")
        fake_output = Path("/fake/output")

        try:
            extract_vocals_stage1(
                fake_input,
                fake_output,
                prefer_speed=False,
                model_tier="quality",
            )
        except Exception:
            pass  # We only care about the overlap value captured

    assert "value" in captured_overlap, "run_vocal_onnx was never called"
    assert captured_overlap["value"] == 0.75, (
        f"Bug 1 confirmed: quality mode overlap is {captured_overlap['value']} "
        f"but should be 0.75"
    )


def test_bug2_use_demucs_shifts_0_defaults_to_false_when_unset():
    """
    Bug 2: When USE_DEMUCS_SHIFTS_0 is not set in the environment,
    it should default to False (allowing quality mode to use shifts=3).

    EXPECTED: This test FAILS on unfixed code (defaults to True).
    After fix: This test PASSES.
    """
    # Remove the env var if it exists, then reimport the config module
    env_copy = os.environ.copy()
    env_copy.pop("USE_DEMUCS_SHIFTS_0", None)

    with patch.dict(os.environ, env_copy, clear=True):
        # Force reimport of the config module to pick up the patched env
        import stem_service.config.device as device_mod
        importlib.reload(device_mod)
        result = device_mod.USE_DEMUCS_SHIFTS_0

    assert result is False, (
        f"Bug 2 confirmed: USE_DEMUCS_SHIFTS_0 is {result} when env var is unset, "
        f"but should be False"
    )
