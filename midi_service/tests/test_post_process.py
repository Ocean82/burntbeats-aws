"""Unit tests for MIDI post-processing."""

from __future__ import annotations

from midi_service.post_process import (
    apply_post_process,
    filter_by_max_duration,
    normalize_velocities,
    quantize_notes_with_strength,
)


def _note(pitch: int, start: float, duration: float, velocity: int = 80) -> dict:
    return {
        "pitch": pitch,
        "start": start,
        "duration": duration,
        "velocity": velocity,
    }


class TestNormalizeVelocities:
    def test_scales_peak_to_target(self):
        notes = [_note(60, 0, 1, 127), _note(62, 1, 1, 64)]
        out = normalize_velocities(notes, target_velocity=90)
        assert max(n["velocity"] for n in out) == 90
        assert out[1]["velocity"] < out[0]["velocity"]


class TestFilterByMaxDuration:
    def test_removes_long_notes(self):
        notes = [_note(60, 0, 0.5), _note(62, 1, 5.0)]
        kept, removed = filter_by_max_duration(notes, 2.0)
        assert len(kept) == 1
        assert removed == 1


class TestQuantizeWithStrength:
    def test_full_strength_snaps_start(self):
        notes = [_note(60, 0.03, 0.5)]
        out = quantize_notes_with_strength(notes, bpm=120, grid="1/4", strength=1.0)
        assert out[0]["start"] == 0.0

    def test_zero_strength_unchanged(self):
        notes = [_note(60, 0.37, 0.5)]
        out = quantize_notes_with_strength(notes, bpm=120, grid="1/4", strength=0.0)
        assert out[0]["start"] == 0.37


class TestApplyPostProcess:
    def test_velocity_normalization_flag(self):
        notes = [_note(60, 0, 1, 100)]
        out, metrics = apply_post_process(
            notes,
            {"normalize_velocity": True, "target_velocity": 80},
        )
        assert metrics["velocity_normalized"] is True
        assert out[0]["velocity"] == 80

    def test_quantize_when_enabled(self):
        notes = [_note(60, 0.02, 0.48), _note(64, 1.02, 0.48)]
        out, metrics = apply_post_process(
            notes,
            {"quantize_strength": 1.0},
            quantize=True,
            quantize_bpm=120,
            quantize_grid="1/4",
        )
        assert metrics["quantization_applied"] is True
        assert len(out) >= 1
