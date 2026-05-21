"""
MIDI conversion pipeline — wraps Spotify Basic Pitch for audio-to-MIDI transcription.

Basic Pitch is a lightweight neural network that runs on CPU.
Typical inference: 2-8 seconds for a 3-4 minute audio file.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

import numpy as np

from midi_service.job_utils import OUTPUT_FILENAME, write_progress

logger = logging.getLogger(__name__)

# Lazy-loaded model reference (loaded once at startup, reused across jobs)
_model_path = None


def preload_model() -> None:
    """Load the Basic Pitch ONNX model and run a warmup inference on silence.

    Called once at service startup to avoid cold-start latency on the first
    real conversion request. The warmup runs predict() on a 1-second silence
    WAV file so that all ONNX runtime internals are initialized.
    """
    global _model_path

    import tempfile

    import soundfile as sf
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict

    _model_path = ICASSP_2022_MODEL_PATH
    logger.info("Basic Pitch model path loaded: %s", _model_path)

    # Warmup: write 1 second of silence to a temp WAV file (predict expects a file path)
    silence = np.zeros(22050, dtype=np.float32)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp.name, silence, 22050)
        warmup_path = tmp.name

    logger.info("Running warmup inference on 1-second silence buffer...")
    t0 = time.perf_counter()
    predict(warmup_path, model_or_model_path=_model_path)
    elapsed = time.perf_counter() - t0
    logger.info("Warmup inference completed in %.2fs", elapsed)

    # Clean up temp file
    Path(warmup_path).unlink(missing_ok=True)


def _get_model_path():
    """Return the cached model path, loading it if necessary."""
    global _model_path
    if _model_path is None:
        from basic_pitch import ICASSP_2022_MODEL_PATH

        _model_path = ICASSP_2022_MODEL_PATH
        logger.info("Basic Pitch model loaded (lazy): %s", _model_path)
    return _model_path


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
        - min_confidence (float): Note confidence threshold (0.0-1.0, default 0.5)
        - min_note_length_ms (int): Minimum note duration in ms (default 58)
        - include_pitch_bends (bool): Include pitch bend data (default True)
    """
    from basic_pitch.inference import predict

    job_log = logging.getLogger(f"midi.job.{job_id}")

    # --- Progress: processing at start (progress=10) ---
    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 10,
        "message": "Starting MIDI conversion",
    })

    model_path = _get_model_path()

    # Parse and clamp options
    min_confidence = float(options.get("min_confidence", 0.5))
    min_note_length_ms = int(options.get("min_note_length_ms", 58))
    include_pitch_bends = bool(options.get("include_pitch_bends", True))

    min_confidence = max(0.05, min(0.95, min_confidence))
    min_note_length_ms = max(10, min(500, min_note_length_ms))

    # --- Run Basic Pitch inference ---
    t_start = time.perf_counter()

    model_output, midi_data, note_events = predict(
        str(input_path),
        model_or_model_path=model_path,
        onset_threshold=min_confidence,
        frame_threshold=max(0.1, min_confidence - 0.2),
        minimum_note_length=min_note_length_ms,
        include_pitch_bends=include_pitch_bends,
    )

    inference_time_seconds = round(time.perf_counter() - t_start, 3)

    job_log.info(
        "Inference complete: %.2fs, %d raw note events",
        inference_time_seconds,
        len(note_events),
    )

    # --- Write MIDI file to out_dir/output.mid ---
    output_path = out_dir / OUTPUT_FILENAME
    midi_data.write(str(output_path))

    # --- Extract and filter note events into piano_roll_notes ---
    # note_events format: list of (start_time_s, end_time_s, pitch, velocity, confidence)
    min_duration_s = min_note_length_ms / 1000.0
    piano_roll_notes: list[dict] = []

    for event in note_events:
        start_s = float(event[0])
        end_s = float(event[1])
        pitch = int(event[2])
        velocity = int(round(float(event[3]) * 127)) if float(event[3]) <= 1.0 else int(event[3])
        confidence = float(event[4]) if len(event) > 4 else 1.0

        duration = end_s - start_s

        # Filter by confidence threshold
        if confidence < min_confidence:
            continue

        # Filter by minimum note duration
        if duration < min_duration_s:
            continue

        # Clamp velocity to valid MIDI range
        velocity = max(0, min(127, velocity))

        piano_roll_notes.append({
            "pitch": pitch,
            "start": round(start_s, 4),
            "duration": round(duration, 4),
            "velocity": velocity,
        })

    # --- Handle zero-note results gracefully ---
    notes_detected = len(piano_roll_notes)
    duration_seconds = midi_data.get_end_time() if midi_data.instruments else 0.0
    tracks = len(midi_data.instruments)

    if notes_detected == 0:
        job_log.info("Zero notes detected for job %s (completed with empty result)", job_id)

    # --- Progress: completed with full result dict ---
    write_progress(out_dir, {
        "status": "completed",
        "job_id": job_id,
        "progress": 100,
        "message": "Conversion complete",
        "result": {
            "notes_detected": notes_detected,
            "duration_seconds": round(duration_seconds, 2),
            "tracks": tracks,
            "inference_time_seconds": inference_time_seconds,
            "piano_roll_notes": piano_roll_notes,
        },
    })

    job_log.info(
        "Job %s completed: %d notes, %.2fs inference, output at %s",
        job_id,
        notes_detected,
        inference_time_seconds,
        output_path,
    )
