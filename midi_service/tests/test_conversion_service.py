from __future__ import annotations

from midi_service.services.conversion import build_metadata_payload


def test_build_metadata_payload_preserves_public_metadata_shape():
    payload = build_metadata_payload(
        job_id="job-123",
        options={
            "stem_job_id": "stem-123",
            "stem_name": "vocals",
            "user_id": "user-123",
            "normalize_velocity": False,
            "target_velocity": 110,
            "max_note_length_ms": 2400,
            "quantize_strength": 0.75,
        },
        notes_detected=24,
        duration_seconds=12.34,
        analysis={"estimated_key": "C major"},
        min_confidence=0.65,
        min_note_length_ms=72,
        include_pitch_bends=False,
        quantize_enabled=True,
        quantize_grid="1/8",
        quantize_bpm=128,
        created_at="2026-05-26T12:00:00+00:00",
        midi_file_analysis={
            "format": 1,
            "track_count": 2,
            "note_count": 24,
            "tempo_bpm": 128,
        },
    )

    assert payload == {
        "job_id": "job-123",
        "stem_job_id": "stem-123",
        "stem_name": "vocals",
        "user_id": "user-123",
        "notes_detected": 24,
        "duration_seconds": 12.34,
        "created_at": "2026-05-26T12:00:00+00:00",
        "settings": {
            "min_confidence": 0.65,
            "min_note_length_ms": 72,
            "include_pitch_bends": False,
            "quantize": True,
            "quantize_grid": "1/8",
            "quantize_bpm": 128,
            "normalize_velocity": False,
            "target_velocity": 110,
            "max_note_length_ms": 2400,
            "quantize_strength": 0.75,
        },
        "analysis": {"estimated_key": "C major"},
        "midi_file_analysis": {
            "format": 1,
            "track_count": 2,
            "note_count": 24,
            "tempo_bpm": 128,
        },
    }
