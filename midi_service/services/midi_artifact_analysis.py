from __future__ import annotations

from pathlib import Path
from typing import Any

import mido

GM_INSTRUMENTS = [
    "Acoustic Grand Piano",
    "Bright Acoustic Piano",
    "Electric Grand Piano",
    "Honky-tonk Piano",
    "Electric Piano 1",
    "Electric Piano 2",
    "Harpsichord",
    "Clavi",
    "Celesta",
    "Glockenspiel",
    "Music Box",
    "Vibraphone",
    "Marimba",
    "Xylophone",
    "Tubular Bells",
    "Dulcimer",
    "Drawbar Organ",
    "Percussive Organ",
    "Rock Organ",
    "Church Organ",
    "Reed Organ",
    "Accordion",
    "Harmonica",
    "Tango Accordion",
    "Acoustic Guitar (nylon)",
    "Acoustic Guitar (steel)",
    "Electric Guitar (jazz)",
    "Electric Guitar (clean)",
    "Electric Guitar (muted)",
    "Overdriven Guitar",
    "Distortion Guitar",
    "Guitar harmonics",
    "Acoustic Bass",
    "Electric Bass (finger)",
    "Electric Bass (pick)",
    "Fretless Bass",
    "Slap Bass 1",
    "Slap Bass 2",
    "Synth Bass 1",
    "Synth Bass 2",
    "Violin",
    "Viola",
    "Cello",
    "Contrabass",
    "Tremolo Strings",
    "Pizzicato Strings",
    "Orchestral Harp",
    "Timpani",
    "String Ensemble 1",
    "String Ensemble 2",
    "SynthStrings 1",
    "SynthStrings 2",
    "Choir Aahs",
    "Voice Oohs",
    "Synth Voice",
    "Orchestra Hit",
    "Trumpet",
    "Trombone",
    "Tuba",
    "Muted Trumpet",
    "French Horn",
    "Brass Section",
    "SynthBrass 1",
    "SynthBrass 2",
    "Soprano Sax",
    "Alto Sax",
    "Tenor Sax",
    "Baritone Sax",
    "Oboe",
    "English Horn",
    "Bassoon",
    "Clarinet",
    "Piccolo",
    "Flute",
    "Recorder",
    "Pan Flute",
    "Blown Bottle",
    "Shakuhachi",
    "Whistle",
    "Ocarina",
    "Lead 1 (square)",
    "Lead 2 (sawtooth)",
    "Lead 3 (calliope)",
    "Lead 4 (chiff)",
    "Lead 5 (charang)",
    "Lead 6 (voice)",
    "Lead 7 (fifths)",
    "Lead 8 (bass + lead)",
    "Pad 1 (new age)",
    "Pad 2 (warm)",
    "Pad 3 (polysynth)",
    "Pad 4 (choir)",
    "Pad 5 (bowed)",
    "Pad 6 (metallic)",
    "Pad 7 (halo)",
    "Pad 8 (sweep)",
    "FX 1 (rain)",
    "FX 2 (soundtrack)",
    "FX 3 (crystal)",
    "FX 4 (atmosphere)",
    "FX 5 (brightness)",
    "FX 6 (goblins)",
    "FX 7 (echoes)",
    "FX 8 (sci-fi)",
    "Sitar",
    "Banjo",
    "Shamisen",
    "Koto",
    "Kalimba",
    "Bag pipe",
    "Fiddle",
    "Shanai",
    "Tinkle Bell",
    "Agogo",
    "Steel Drums",
    "Woodblock",
    "Taiko Drum",
    "Melodic Tom",
    "Synth Drum",
    "Reverse Cymbal",
    "Guitar Fret Noise",
    "Breath Noise",
    "Seashore",
    "Bird Tweet",
    "Telephone Ring",
    "Helicopter",
    "Applause",
    "Gunshot",
]

KEY_SIGNATURES = {
    -7: "Cb major",
    -6: "Gb major",
    -5: "Db major",
    -4: "Ab major",
    -3: "Eb major",
    -2: "Bb major",
    -1: "F major",
    0: "C major",
    1: "G major",
    2: "D major",
    3: "A major",
    4: "E major",
    5: "B major",
    6: "F# major",
    7: "C# major",
}


def get_instrument_name(program_number: int) -> str:
    if 0 <= program_number < len(GM_INSTRUMENTS):
        return GM_INSTRUMENTS[program_number]
    return f"Unknown Instrument ({program_number})"


def get_key_signature(key_number: int) -> str:
    return KEY_SIGNATURES.get(key_number, "C major")


def _derive_genre_hints(
    *,
    tempo_bpm: int,
    has_drums: bool,
    instrument_names: list[str],
) -> list[str]:
    hints: list[str] = []

    if tempo_bpm > 140:
        hints.extend(["electronic", "dance", "techno"])
    elif tempo_bpm < 70:
        hints.extend(["ballad", "ambient", "classical"])
    elif 120 <= tempo_bpm <= 140:
        hints.extend(["pop", "rock", "folk"])

    if has_drums:
        hints.extend(["pop", "rock", "electronic"])

    if "Acoustic Grand Piano" in instrument_names:
        hints.extend(["classical", "jazz", "ballad"])

    if "Distortion Guitar" in instrument_names or "Overdriven Guitar" in instrument_names:
        hints.extend(["rock", "metal", "blues"])

    if any("Synth" in name for name in instrument_names):
        hints.extend(["electronic", "synthwave", "pop"])

    deduped: list[str] = []
    for hint in hints:
        if hint not in deduped:
            deduped.append(hint)
    return deduped[:5]


def _compute_complexity_score(
    *,
    track_count: int,
    note_count: int,
    instrument_count: int,
    duration_seconds: float,
    has_drums: bool,
    note_range: int,
) -> float:
    factors = [
        min(track_count / 8, 1) * 2,
        min(note_count / 1000, 1) * 3,
        min(instrument_count / 8, 1) * 2,
        min(duration_seconds / 300, 1) * 1,
        (1 if has_drums else 0) * 1,
        min(note_range / 60, 1) * 1,
    ]
    return round(sum(factors), 2)


def analyze_midi_artifact(midi_path: Path) -> dict[str, Any]:
    midi = mido.MidiFile(midi_path)

    tempo_bpm = 120
    time_signature: list[int] | None = None
    key_signature = "C major"
    note_count = 0
    has_drums = False
    instrument_programs: set[int] = set()
    instrument_names: set[str] = set()
    note_min = 127
    note_max = 0
    total_ticks = 0
    track_info: list[dict[str, Any]] = []

    for track_idx, track in enumerate(midi.tracks):
        info: dict[str, Any] = {
            "index": track_idx,
            "name": f"Track {track_idx + 1}",
            "instrument": None,
            "instrument_name": None,
            "notes": 0,
            "is_drum": False,
            "channel": None,
        }
        current_time = 0
        track_notes = 0

        for msg in track:
            current_time += msg.time

            if msg.type == "set_tempo":
                tempo_bpm = int(round(mido.tempo2bpm(msg.tempo)))
            elif msg.type == "time_signature" and time_signature is None:
                time_signature = [msg.numerator, msg.denominator]
            elif msg.type == "key_signature":
                key_signature = get_key_signature(msg.key)
            elif msg.type == "program_change":
                program = int(msg.program)
                instrument_programs.add(program)
                name = get_instrument_name(program)
                instrument_names.add(name)
                info["instrument"] = program
                info["instrument_name"] = name
                info["channel"] = getattr(msg, "channel", None)
            elif msg.type == "track_name":
                info["name"] = msg.name
            elif msg.type == "note_on" and msg.velocity > 0:
                track_notes += 1
                note_count += 1
                note_min = min(note_min, msg.note)
                note_max = max(note_max, msg.note)
                channel = getattr(msg, "channel", None)
                if channel == 9:
                    info["is_drum"] = True
                    has_drums = True

        info["notes"] = track_notes
        total_ticks = max(total_ticks, current_time)
        track_info.append(info)

    duration_seconds = 0.0
    if midi.ticks_per_beat and tempo_bpm > 0:
        duration_seconds = (total_ticks / midi.ticks_per_beat) * (60 / tempo_bpm)

    note_range = max(0, note_max - note_min) if note_count else 0
    genre_hints = _derive_genre_hints(
        tempo_bpm=tempo_bpm,
        has_drums=has_drums,
        instrument_names=sorted(instrument_names),
    )
    complexity_score = _compute_complexity_score(
        track_count=len(midi.tracks),
        note_count=note_count,
        instrument_count=len(instrument_names),
        duration_seconds=duration_seconds,
        has_drums=has_drums,
        note_range=note_range,
    )

    return {
        "format": midi.type,
        "track_count": len(midi.tracks),
        "note_count": note_count,
        "tempo_bpm": tempo_bpm,
        "time_signature": time_signature,
        "key_signature": key_signature,
        "has_drums": has_drums,
        "instrument_programs": sorted(instrument_programs),
        "instrument_names": sorted(instrument_names),
        "note_range": {"min": note_min if note_count else None, "max": note_max if note_count else None},
        "duration_seconds": round(duration_seconds, 2),
        "genre_hints": genre_hints,
        "track_info": track_info,
        "complexity_score": complexity_score,
    }
