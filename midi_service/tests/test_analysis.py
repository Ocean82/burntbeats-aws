"""Unit tests for MIDI note analysis."""

from __future__ import annotations

from midi_service.analysis import analyze_notes


def _note(pitch: int, start: float, duration: float = 0.5, velocity: int = 90) -> dict:
    return {
        "pitch": pitch,
        "start": start,
        "duration": duration,
        "velocity": velocity,
    }


class TestAnalyzeNotes:
    def test_empty_notes(self):
        result = analyze_notes([], 5.0)
        assert result["estimated_key"] == "unknown"
        assert result["total_notes"] == 0
        assert result["suggested_bpm"] is None

    def test_c_major_scale_hints_c_major(self):
        # C major scale fragment: C D E F G (MIDI 60-67)
        notes = [
            _note(60, 0.0),
            _note(62, 0.5),
            _note(64, 1.0),
            _note(65, 1.5),
            _note(67, 2.0),
        ]
        result = analyze_notes(notes, 3.0)
        assert result["total_notes"] == 5
        assert "C" in result["estimated_key"]
        assert result["pitch_range"]["min"] == 60
        assert result["pitch_range"]["max"] == 67
        assert result["note_density"] > 0
        assert result["complexity_score"] >= 0

    def test_suggested_bpm_from_regular_onsets(self):
        # Quarter notes at 120 BPM → 0.5s apart
        notes = [_note(60, i * 0.5) for i in range(8)]
        result = analyze_notes(notes, 4.0)
        assert result["suggested_bpm"] is not None
        assert 90 <= result["suggested_bpm"] <= 150
