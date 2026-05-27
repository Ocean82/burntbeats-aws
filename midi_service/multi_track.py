"""
Multi-track MIDI export — combines multiple conversion jobs into a single
MIDI Type 1 file with separate tracks per stem.

This is what DAW users expect: one .mid file with vocals, bass, drums, melody
on separate named tracks with appropriate GM instrument programs.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Literal

import pretty_midi

logger = logging.getLogger(__name__)

# General MIDI program suggestions for common stem types
DEFAULT_PROGRAMS: dict[str, int] = {
    "vocals": 52,    # Choir Aahs
    "voice": 52,     # Choir Aahs
    "bass": 33,      # Electric Bass (finger)
    "drums": 0,      # (will use is_drum=True instead)
    "melody": 0,     # Acoustic Grand Piano
    "piano": 0,      # Acoustic Grand Piano
    "guitar": 25,    # Acoustic Guitar (steel)
    "strings": 48,   # String Ensemble 1
    "synth": 80,     # Lead 1 (square)
    "pad": 88,       # Pad 1 (new age)
    "other": 0,      # Acoustic Grand Piano
}

DRUM_STEMS = {"drums", "drum", "percussion", "perc"}


def suggest_program(stem_name: str) -> int:
    """Suggest a General MIDI program number for a stem name."""
    name = stem_name.strip().lower()
    for key, program in DEFAULT_PROGRAMS.items():
        if key in name:
            return program
    return 0  # Default to piano


def is_drum_stem(stem_name: str) -> bool:
    """Check if a stem name suggests it's a drum/percussion track."""
    name = stem_name.strip().lower()
    return any(d in name for d in DRUM_STEMS)


def merge_jobs_to_multitrack(
    jobs: list[dict[str, Any]],
    output_path: Path,
    *,
    bpm: int = 120,
    time_mode: Literal["absolute_seconds", "bars_beats"] = "absolute_seconds",
    tempo_map: Any | None = None,
) -> dict[str, Any]:
    """
    Merge multiple conversion job results into a single multi-track MIDI file.

    Parameters
    ----------
    jobs : list of dict
        Each dict must contain:
        - stem_name: str — track name
        - notes: list[dict] — piano_roll_notes from conversion result
        - program: int (optional) — GM program number (0-127)
        - transpose: int (optional) — semitones to shift (+/- 12)
        - is_drum: bool (optional) — use MIDI channel 10 for drums
    output_path : Path
        Where to write the merged .mid file.
    bpm : int
        Tempo for the merged file.
    time_mode : {\"absolute_seconds\", \"bars_beats\"}
        How note timing is interpreted. In ``\"absolute_seconds\"`` mode,
        ``start`` and ``duration`` are assumed to be in seconds (current
        behavior). In ``\"bars_beats\"`` mode, callers may pass bar/beat
        based structures and must also supply a compatible ``tempo_map``.
    tempo_map :
        Optional tempo map object used when ``time_mode=\"bars_beats\"``.

    Returns
    -------
    dict with merge metadata (track_count, total_notes, duration_seconds).
    """
    midi = pretty_midi.PrettyMIDI(initial_tempo=max(40, min(300, bpm)))
    total_notes = 0
    max_end_time = 0.0

    for job in jobs:
        stem_name = job.get("stem_name", "Track")
        notes = job.get("notes", [])
        program = int(job.get("program", suggest_program(stem_name)))
        transpose = int(job.get("transpose", 0))
        drum = bool(job.get("is_drum", is_drum_stem(stem_name)))

        # Clamp program to valid range
        program = max(0, min(127, program))
        # Clamp transpose to ±48 semitones (4 octaves)
        transpose = max(-48, min(48, transpose))

        inst = pretty_midi.Instrument(
            program=program if not drum else 0,
            is_drum=drum,
            name=stem_name,
        )

        for note in notes:
            pitch = max(0, min(127, int(note["pitch"]) + transpose))

            # Interpret timing according to the selected mode. For now
            # we only support seconds directly; bar/beat modes can be
            # added later alongside richer timing metadata in `note`.
            if time_mode == "absolute_seconds":
                start = float(note["start"])
                duration = float(note["duration"])
            else:
                if tempo_map is None:
                    raise ValueError(
                        "tempo_map is required when time_mode='bars_beats'"
                    )
                # Future extension point: convert bar/beat fields on
                # the note dict into seconds using `tempo_map`.
                start = float(note.get("start_seconds", 0.0))
                duration = float(note.get("duration_seconds", 0.0))

            # Enforce sane duration lower bound.
            duration = max(duration, 0.01)

            velocity = max(1, min(127, int(note["velocity"])))
            end = start + duration

            inst.notes.append(
                pretty_midi.Note(
                    velocity=velocity,
                    pitch=pitch,
                    start=start,
                    end=end,
                )
            )
            max_end_time = max(max_end_time, end)

        midi.instruments.append(inst)
        total_notes += len(notes)
        logger.info(
            "Track '%s': %d notes, program=%d, drum=%s, transpose=%+d",
            stem_name,
            len(notes),
            program,
            drum,
            transpose,
        )

    midi.write(str(output_path))

    return {
        "track_count": len(jobs),
        "total_notes": total_notes,
        "duration_seconds": round(max_end_time, 2),
        "bpm": bpm,
        "output_path": str(output_path),
    }
