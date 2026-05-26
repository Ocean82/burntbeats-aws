from __future__ import annotations

from pathlib import Path

import pytest

from midi_service.services.options import build_enqueue_item, parse_convert_form_options


def test_parse_convert_form_options_normalizes_strings_to_typed_values():
    options = parse_convert_form_options(
        {
            "min_confidence": "0.65",
            "min_note_length_ms": "72",
            "include_pitch_bends": "false",
            "quantize": "true",
            "quantize_grid": "1/8",
            "quantize_bpm": "128",
            "quantize_strength": "0.8",
            "normalize_velocity": "false",
            "target_velocity": "101",
            "max_note_length_ms": "1800",
            "transpose": "-5",
            "stem_job_id": "",
            "stem_name": "vocals",
            "user_id": "",
        }
    )

    assert options == {
        "min_confidence": 0.65,
        "min_note_length_ms": 72,
        "include_pitch_bends": False,
        "quantize": True,
        "quantize_grid": "1/8",
        "quantize_bpm": 128,
        "quantize_strength": 0.8,
        "normalize_velocity": False,
        "target_velocity": 101,
        "max_note_length_ms": 1800,
        "transpose": -5,
        "stem_job_id": None,
        "stem_name": "vocals",
        "user_id": None,
    }


def test_parse_convert_form_options_rejects_invalid_quantize_grid():
    with pytest.raises(ValueError, match="quantize_grid must be one of"):
        parse_convert_form_options({"quantize_grid": "1/3"})


def test_build_enqueue_item_merges_identifiers_with_normalized_options():
    out_dir = Path("/tmp/midi/job-1")
    input_path = out_dir / "input.wav"
    options = parse_convert_form_options({"user_id": "user-123"})

    item = build_enqueue_item(
        job_id="job-1",
        out_dir=out_dir,
        input_path=input_path,
        options=options,
    )

    assert item == {
        "job_id": "job-1",
        "out_dir": out_dir,
        "input_path": str(input_path),
        "min_confidence": 0.5,
        "min_note_length_ms": 58,
        "include_pitch_bends": True,
        "quantize": False,
        "quantize_grid": "1/16",
        "quantize_bpm": 120,
        "quantize_strength": 1.0,
        "normalize_velocity": True,
        "target_velocity": 90,
        "max_note_length_ms": 0,
        "transpose": 0,
        "stem_job_id": None,
        "stem_name": None,
        "user_id": "user-123",
    }
