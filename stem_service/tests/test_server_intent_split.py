from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service.routing.schema import parse_intent_dict


def test_parse_intent_extract_vocals() -> None:
    intent = parse_intent_dict(
        {"task": "extract", "targets": ["vocals"], "quality": "fast"}
    )
    assert intent.task == "extract"
    assert intent.targets == ("vocals",)
    assert intent.quality == "fast"


def test_parse_intent_full_separation() -> None:
    intent = parse_intent_dict(
        {"task": "full_separation", "mode": "4", "quality": "high"}
    )
    assert intent.mode == "4"
    assert intent.output_stem_ids() == ("vocals", "drums", "bass", "other")


def test_parse_intent_remove_vocals() -> None:
    intent = parse_intent_dict(
        {"task": "remove", "targets": ["vocals"], "quality": "high"}
    )
    assert intent.output_stem_ids() == ("instrumental",)
