from __future__ import annotations

from pathlib import Path

import mido

from midi_service.services.midi_artifact_analysis import analyze_midi_artifact


def test_analyze_midi_artifact_extracts_tempo_tracks_and_programs(tmp_path):
    midi_path = Path(tmp_path) / "output.mid"

    midi = mido.MidiFile(type=1)
    meta_track = mido.MidiTrack()
    meta_track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(128), time=0))
    meta_track.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    meta_track.append(mido.MetaMessage("end_of_track", time=0))
    midi.tracks.append(meta_track)

    instrument_track = mido.MidiTrack()
    instrument_track.append(mido.Message("program_change", program=52, channel=0, time=0))
    instrument_track.append(mido.Message("note_on", note=60, velocity=96, channel=0, time=0))
    instrument_track.append(mido.Message("note_off", note=60, velocity=0, channel=0, time=480))
    instrument_track.append(mido.MetaMessage("end_of_track", time=0))
    midi.tracks.append(instrument_track)
    midi.save(midi_path)

    analysis = analyze_midi_artifact(midi_path)

    assert analysis["format"] == 1
    assert analysis["track_count"] == 2
    assert analysis["note_count"] == 1
    assert analysis["tempo_bpm"] == 128
    assert analysis["time_signature"] == [4, 4]
    assert analysis["has_drums"] is False
    assert analysis["instrument_programs"] == [52]
    assert "genre_hints" in analysis
    assert "track_info" in analysis
    assert "complexity_score" in analysis
    assert "instrument_names" in analysis
    assert analysis["instrument_names"] == ["Choir Aahs"]
    assert analysis["track_info"][1]["instrument_name"] == "Choir Aahs"
