from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service.job_utils import build_progress_payload
from stem_service.routing.progress_stages import intent_queued_label, intent_running_stage


def test_intent_queued_extract_vocals() -> None:
    label = intent_queued_label(
        {"task": "extract", "targets": ["vocals"], "quality": "fast"}
    )
    assert label == "Waiting to extract vocals…"


def test_intent_running_extract_vocals() -> None:
    code, label = intent_running_stage(
        {"task": "extract", "targets": ["vocals"]},
        50,
        active_job_kind="vocals_only",
    )
    assert code == "extracting_vocals"
    assert label == "Extracting vocals…"


def test_build_progress_payload_uses_intent_stage() -> None:
    payload = build_progress_payload(
        status="running",
        progress=40,
        stem_count=1,
        quality_mode="speed",
        intent={"task": "extract", "targets": ["drums"]},
        active_job_kind="demucs_4_fallback",
    )
    assert payload["progress_stage"] == "separating_vocals"
    assert "vocals" in payload["progress_stage_label"].lower()
    assert payload["intent"]["task"] == "extract"


def test_build_progress_payload_full_separation_uses_intent_stages() -> None:
    payload = build_progress_payload(
        status="running",
        progress=50,
        stem_count=4,
        quality_mode="quality",
        intent={"task": "full_separation", "mode": "4", "quality": "high"},
    )
    assert payload["progress_stage"] == "separating_vocals"
    assert payload["progress_stage_label"] == "Separating vocals…"
