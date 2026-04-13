"""Tests for 2-stem Stage 1 preview helpers."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service.vocal_stage1 import get_2stem_stage1_preview


def test_get_2stem_stage1_preview_demucs_only_short_circuits() -> None:
    kind, models = get_2stem_stage1_preview(
        prefer_speed=False,
        model_tier="quality",
        stem_backend="demucs_only",
    )
    assert kind == "demucs"
    assert models == ["htdemucs"]
