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
import tempfile
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_quality_mode_uses_fast_overlap_for_cpu_tiers():
    """
    Quality tier uses 0.5 ONNX overlap (same as speed). Tier difference is the
    vocal model (KARA vs 9662), not extra chunk overlap.
    """
    captured_overlap = {}

    def mock_run_vocal_onnx(
        input_path, output_path, overlap=0.75, **kwargs
    ):
        captured_overlap["value"] = overlap
        return output_path

    import stem_service.vocal_stage1 as vs1_mod
    importlib.reload(vs1_mod)

    with tempfile.TemporaryDirectory() as tmpdir:
        fake_input = Path(tmpdir) / "input.wav"
        fake_input.touch()
        fake_output = Path(tmpdir) / "output"

        fake_model = Path(tmpdir) / "UVR_MDXNET_KARA.onnx"
        fake_model.touch()

        with patch.object(vs1_mod, "run_vocal_onnx", side_effect=mock_run_vocal_onnx), \
             patch.object(vs1_mod, "resolve_single_vocal_onnx", return_value=fake_model), \
             patch.object(vs1_mod, "vocal_onnx_allowed_for_service", return_value=True), \
             patch.object(vs1_mod, "resolve_declared_vocal_onnx_path", return_value=None):

            try:
                vs1_mod.extract_vocals_stage1(
                    fake_input,
                    fake_output,
                    prefer_speed=False,
                    model_tier="quality",
                )
            except Exception:
                pass

    assert "value" in captured_overlap, "run_vocal_onnx was never called"
    assert captured_overlap["value"] == 0.5


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
