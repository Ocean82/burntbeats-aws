from __future__ import annotations

from pathlib import Path

import pretty_midi

from midi_service.multi_track import merge_jobs_to_multitrack


def _load_midi(path: Path) -> pretty_midi.PrettyMIDI:
    return pretty_midi.PrettyMIDI(str(path))


def test_merge_creates_one_track_per_job(tmp_path: Path) -> None:
    output = tmp_path / "merged.mid"
    jobs = [
        {
            "stem_name": "vocals",
            "notes": [
                {"pitch": 60, "start": 0.0, "duration": 1.0, "velocity": 100},
            ],
        },
        {
            "stem_name": "drums",
            "notes": [
                {"pitch": 36, "start": 0.5, "duration": 0.5, "velocity": 110},
            ],
        },
    ]

    meta = merge_jobs_to_multitrack(jobs, output_path=output, bpm=120)
    assert meta["track_count"] == 2
    assert meta["total_notes"] == 2
    assert meta["duration_seconds"] >= 1.0

    midi = _load_midi(output)
    assert len(midi.instruments) == 2
    assert {inst.name for inst in midi.instruments} == {"vocals", "drums"}


def test_merge_clamps_note_properties(tmp_path: Path) -> None:
    output = tmp_path / "merged.mid"
    jobs = [
        {
            "stem_name": "loud",
            "notes": [
                {
                    "pitch": 200,  # out of range
                    "start": 0.0,
                    "duration": -5.0,  # negative
                    "velocity": 500,  # out of range
                }
            ],
        }
    ]

    meta = merge_jobs_to_multitrack(jobs, output_path=output, bpm=120)
    assert meta["total_notes"] == 1

    midi = _load_midi(output)
    inst = midi.instruments[0]
    note = inst.notes[0]
    assert 0 <= note.pitch <= 127
    assert 1 <= note.velocity <= 127
    # pretty_midi serializes durations to tick grid, so allow a small
    # tolerance rather than checking against an exact lower bound.
    assert note.end - note.start >= 0.009

