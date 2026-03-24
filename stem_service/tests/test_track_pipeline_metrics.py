"""Schema tests for scripts/track_pipeline_metrics.py (no heavy separation)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = REPO_ROOT / "scripts" / "track_pipeline_metrics.py"
_spec = importlib.util.spec_from_file_location("track_pipeline_metrics", _SCRIPT)
assert _spec and _spec.loader
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
make_metrics_record = _mod.make_metrics_record


def test_make_metrics_record_has_job_metrics_fields() -> None:
    rec = make_metrics_record(
        mode_name="2_stem_quality",
        stem_count=2,
        prefer_speed=False,
        models_used=["Kim_Vocal_2.onnx", "phase_inversion"],
        elapsed_seconds=12.34,
        audio_duration_seconds=30.0,
        run_id="00000000-0000-4000-8000-000000000001",
        output_dir="/tmp/out",
    )
    assert rec["mode_name"] == "2_stem_quality"
    assert rec["stem_count"] == 2
    assert rec["quality_mode"] == "quality"
    assert rec["prefer_speed"] is False
    assert rec["models_used"] == ["Kim_Vocal_2.onnx", "phase_inversion"]
    assert rec["elapsed_seconds"] == 12.34
    assert rec["audio_duration_seconds"] == 30.0
    assert rec["realtime_factor"] == pytest.approx(12.34 / 30.0, rel=1e-3)
    assert rec["job_id"] == "00000000-0000-4000-8000-000000000001"
    assert rec["benchmark"] is True
    assert "completed_at" in rec


def test_make_metrics_record_rtf_none_for_zero_duration() -> None:
    rec = make_metrics_record(
        mode_name="2_stem_speed",
        stem_count=2,
        prefer_speed=True,
        models_used=["htdemucs"],
        elapsed_seconds=1.0,
        audio_duration_seconds=0.0,
        run_id="x",
        output_dir="y",
    )
    assert rec["realtime_factor"] is None
