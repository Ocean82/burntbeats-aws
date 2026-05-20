"""
MIDI conversion pipeline — wraps Spotify Basic Pitch for audio-to-MIDI transcription.

Basic Pitch is a lightweight neural network that runs on CPU.
Typical inference: 2-8 seconds for a 3-4 minute audio file.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from midi_service.job_utils import OUTPUT_FILENAME, write_progress

logger = logging.getLogger(__name__)

# Lazy-loaded model reference (loaded once on first use, reused across jobs)
_model = None


def _get_model():
    """Load the Basic Pitch model once and cache it."""
    global _model
    if _model is None:
        from basic_pitch import ICASSP_2022_MODEL_PATH
        _model = ICASSP_2022_MODEL_PATH
        logger.info("Basic Pitch model loaded: %s", _model)
    return _model


def run_midi_convert_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    options: dict,
) -> None:
    """
    Run Basic Pitch inference on an audio file and write a .mid output.

    Parameters
    ----------
    job_id : str
        Unique job identifier.
    input_path : Path
        Path to the input audio file (WAV, MP3, etc.).
    out_dir : Path
        Directory to write output.mid and progress.json.
    options : dict
        Conversion options:
        - min_confidence (float): Note onset/frame threshold (0.0-1.0, default 0.5)
        - min_note_length_ms (int): Minimum note duration in ms (default 58)
        - include_pitch_bends (bool): Include pitch bend data (default True)
    """
    from basic_pitch.inference import predict

    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 10,
        "message": "Loading audio...",
    })

    model_path = _get_model()

    min_confidence = float(options.get("min_confidence", 0.5))
    min_note_length_ms = int(options.get("min_note_length_ms", 58))
    include_pitch_bends = bool(options.get("include_pitch_bends", True))

    # Clamp values to safe ranges
    min_confidence = max(0.05, min(0.95, min_confidence))
    min_note_length_ms = max(10, min(500, min_note_length_ms))

    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 20,
        "message": "Transcribing audio to MIDI...",
    })

    start_time = time.time()

    model_output, midi_data, note_events = predict(
        str(input_path),
        model_or_model_path=model_path,
        onset_threshold=min_confidence,
        frame_threshold=max(0.1, min_confidence - 0.2),
        minimum_note_length=min_note_length_ms,
        include_pitch_bends=include_pitch_bends,
    )

    elapsed = time.time() - start_time
    logger.info(
        "MIDI conversion complete for job %s: %.1fs, %d notes detected",
        job_id, elapsed, len(note_events),
    )

    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 85,
        "message": "Writing MIDI file...",
    })

    # Write the MIDI file
    output_path = out_dir / OUTPUT_FILENAME
    midi_data.write(str(output_path))

    # Compute result metadata
    duration_seconds = midi_data.get_end_time() if midi_data.instruments else 0.0
    notes_detected = len(note_events)
    tracks = len(midi_data.instruments)

    # Build note events for piano roll visualization (send back to frontend)
    piano_roll_notes = []
    for note_event in note_events[:500]:  # Cap at 500 for JSON size
        piano_roll_notes.append({
            "pitch": int(note_event[2]),
            "start": round(float(note_event[0]), 3),
            "duration": round(float(note_event[1]) - float(note_event[0]), 3),
            "velocity": round(float(note_event[3]), 2) if len(note_event) > 3 else 0.8,
        })

    write_progress(out_dir, {
        "status": "completed",
        "job_id": job_id,
        "progress": 100,
        "message": "Conversion complete",
        "result": {
            "notes_detected": notes_detected,
            "duration_seconds": round(duration_seconds, 2),
            "tracks": tracks,
            "inference_time_seconds": round(elapsed, 2),
            "piano_roll_notes": piano_roll_notes,
        },
    })
