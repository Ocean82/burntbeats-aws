"""Write piano-roll note dicts to a Standard MIDI file."""

from __future__ import annotations

from pathlib import Path


def write_notes_to_midi(
    notes: list[dict],
    output_path: Path,
    *,
    bpm: int = 120,
    instrument_name: str = "Transcribed",
    midi_type: int = 1,
) -> None:
    """Serialize note dicts (pitch, start, duration, velocity) to a .mid file."""
    import pretty_midi

    midi = pretty_midi.PrettyMIDI(initial_tempo=max(40, min(300, int(bpm))))
    inst = pretty_midi.Instrument(program=0, name=instrument_name)
    for note in notes:
        start = float(note["start"])
        duration = max(float(note["duration"]), 0.01)
        inst.notes.append(
            pretty_midi.Note(
                velocity=max(1, min(127, int(note["velocity"]))),
                pitch=max(0, min(127, int(note["pitch"]))),
                start=start,
                end=start + duration,
            )
        )
    midi.instruments.append(inst)
    if midi_type == 0 and len(midi.instruments) > 1:
        merged = pretty_midi.Instrument(program=0, name=instrument_name)
        for instrument in midi.instruments:
            merged.notes.extend(instrument.notes)
        midi.instruments = [merged]
    midi.write(str(output_path))
