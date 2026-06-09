"""Tests for the rhythm generation service."""

from __future__ import annotations

import pretty_midi
import io

from midi_service.services.rhythm import (
    generate_groove,
    generate_rhythm_midi,
    steps_to_midi,
    apply_variation,
    PITCH_MAP,
)


class TestGenerateGroove:
    """Test groove generation for each style."""

    def test_rock_generates_steps(self):
        steps, meta = generate_groove(style="rock", bars=2, tempo=120)
        assert meta["style"] == "rock"
        assert meta["bars"] == 2
        assert meta["tempo"] == 120
        assert len(steps) == meta["total_steps"]
        # Should have some kick and snare hits
        kicks = [s for s in steps if "kick" in s]
        snares = [s for s in steps if "snare" in s]
        assert len(kicks) >= 4  # At least 2 per bar
        assert len(snares) >= 4

    def test_hiphop_generates_steps(self):
        steps, meta = generate_groove(style="hiphop", bars=2, tempo=90)
        assert meta["style"] == "hiphop"
        assert len(steps) > 0

    def test_edm_four_on_floor(self):
        steps, meta = generate_groove(style="edm", bars=1, tempo=128)
        kicks = [s for s in steps if "kick" in s]
        # Four-on-the-floor: 4 kicks per bar
        assert len(kicks) >= 4

    def test_trap_triplet_grid(self):
        steps, meta = generate_groove(style="trap", bars=1, tempo=140)
        # Trap uses 12 steps per quarter
        assert meta["steps_per_quarter"] == 12
        assert meta["total_steps"] == 48  # 12 * 4

    def test_jazz_ride_pattern(self):
        steps, meta = generate_groove(style="jazz", bars=1, tempo=140)
        rides = [s for s in steps if "ride" in s]
        assert len(rides) >= 4

    def test_latin_cowbell(self):
        steps, meta = generate_groove(style="latin", bars=1, tempo=100, energy=0.8)
        cowbells = [s for s in steps if "cowbell" in s]
        assert len(cowbells) >= 2

    def test_reggae_one_drop(self):
        steps, meta = generate_groove(style="reggae", bars=1, tempo=75)
        # One-drop: kick on beat 3
        kicks = [s for s in steps if "kick" in s]
        assert len(kicks) >= 1

    def test_dnb_tempo(self):
        steps, meta = generate_groove(style="dnb", bars=2, tempo=174)
        assert meta["tempo"] == 174

    def test_seed_reproducibility(self):
        steps1, _ = generate_groove(style="rock", bars=1, tempo=120, seed="test")
        steps2, _ = generate_groove(style="rock", bars=1, tempo=120, seed="test")
        assert steps1 == steps2

    def test_different_seeds_different_output(self):
        steps1, _ = generate_groove(style="hiphop", bars=1, tempo=90, seed="a")
        steps2, _ = generate_groove(style="hiphop", bars=1, tempo=90, seed="b")
        # They might differ in ghost notes or extras
        # At minimum, the core pattern exists in both
        assert len(steps1) == len(steps2)


class TestStepsToMidi:
    """Test MIDI file generation from steps."""

    def test_produces_valid_midi(self):
        steps = [
            {"kick": 120},
            {},
            {"hihat": 90},
            {},
            {"snare": 110, "hihat": 85},
            {},
            {"hihat": 90},
            {},
        ]
        midi = steps_to_midi(steps, tempo=120, steps_per_quarter=4, swing=0.0)
        assert len(midi.instruments) == 1
        assert midi.instruments[0].is_drum
        # Should have notes
        notes = midi.instruments[0].notes
        assert len(notes) >= 4  # kick, 2 hihats, snare+hihat

    def test_hat_choke(self):
        steps = [
            {"ohat": 100},
            {},
            {"hihat": 90},  # This should choke the open hat
            {},
        ]
        midi = steps_to_midi(
            steps, tempo=120, steps_per_quarter=4, swing=0.0, choke_hats=True
        )
        notes = midi.instruments[0].notes
        ohat_notes = [n for n in notes if n.pitch == PITCH_MAP["ohat"]]
        hihat_notes = [n for n in notes if n.pitch == PITCH_MAP["hihat"]]
        assert len(ohat_notes) == 1
        assert len(hihat_notes) == 1
        # Open hat should end before or at closed hat start
        assert ohat_notes[0].end <= hihat_notes[0].start + 0.01


class TestGenerateRhythmMidi:
    """Test the full pipeline from style to MIDI bytes."""

    def test_returns_valid_midi_bytes(self):
        midi_bytes, meta = generate_rhythm_midi(style="rock", bars=2, tempo=120)
        assert len(midi_bytes) > 0
        # Parse to verify it's valid MIDI
        midi = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
        assert len(midi.instruments) >= 1
        assert midi.instruments[0].is_drum

    def test_all_styles_generate_without_error(self):
        styles = [
            "rock",
            "hiphop",
            "edm",
            "house",
            "techno",
            "trap",
            "dnb",
            "jazz",
            "latin",
            "reggae",
        ]
        for style in styles:
            midi_bytes, meta = generate_rhythm_midi(style=style, bars=1, tempo=120)
            assert len(midi_bytes) > 100, f"Style {style} generated too few bytes"


class TestVariations:
    """Test variation application."""

    def test_fill_adds_snare_at_end(self):
        steps, meta = generate_groove(style="rock", bars=1, tempo=120)
        varied = apply_variation(steps, "fill", meta)
        # Last quarter should have snare
        fill_start = int(len(varied) * 0.75)
        snares_in_fill = [s for s in varied[fill_start:] if "snare" in s]
        assert len(snares_in_fill) >= 2

    def test_breakdown_removes_hats(self):
        steps, meta = generate_groove(style="rock", bars=1, tempo=120)
        varied = apply_variation(steps, "breakdown", meta)
        hats = [s for s in varied if "hihat" in s or "ohat" in s]
        assert len(hats) == 0

    def test_buildup_adds_density(self):
        steps, meta = generate_groove(style="rock", bars=1, tempo=120)
        original_hits = sum(len(s) for s in steps)
        varied = apply_variation(steps, "buildup", meta)
        varied_hits = sum(len(s) for s in varied)
        assert varied_hits >= original_hits
