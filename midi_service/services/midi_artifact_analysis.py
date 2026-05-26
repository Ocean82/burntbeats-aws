from __future__ import annotations

from pathlib import Path
from typing import Any

import mido


def analyze_midi_artifact(midi_path: Path) -> dict[str, Any]:
    midi = mido.MidiFile(midi_path)

    tempo_bpm = None
    time_signature = None
    note_count = 0
    has_drums = False
    instrument_programs: set[int] = set()

    for track in midi.tracks:
        for msg in track:
            if msg.type == "set_tempo" and tempo_bpm is None:
                tempo_bpm = int(round(mido.tempo2bpm(msg.tempo)))
            elif msg.type == "time_signature" and time_signature is None:
                time_signature = [msg.numerator, msg.denominator]
            elif msg.type == "program_change":
                instrument_programs.add(int(msg.program))
                if getattr(msg, "channel", None) == 9:
                    has_drums = True
            elif msg.type == "note_on" and msg.velocity > 0:
                note_count += 1
                if getattr(msg, "channel", None) == 9:
                    has_drums = True

    return {
        "format": midi.type,
        "track_count": len(midi.tracks),
        "note_count": note_count,
        "tempo_bpm": tempo_bpm,
        "time_signature": time_signature,
        "has_drums": has_drums,
        "instrument_programs": sorted(instrument_programs),
    }
