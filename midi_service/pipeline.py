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

from midi_service.analysis import analyze_notes
from midi_service.job_utils import OUTPUT_FILENAME, write_progress
from midi_service.midi_io import write_notes_to_midi
from midi_service.post_process import apply_post_process, quantize_notes_with_strength

logger = logging.getLogger(__name__)

# Lazy-loaded model reference (loaded once at startup, reused across jobs)
_model_path = None


def quantize_notes(notes: list[dict], bpm: int, grid: str) -> list[dict]:
    """Snap notes to grid at full strength (backward-compatible helper)."""
    return quantize_notes_with_strength(notes, bpm, grid, strength=1.0)


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

    silence = np.zeros(22050, dtype=np.float32)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp.name, silence, 22050)
        warmup_path = tmp.name

    logger.info("Running warmup inference on 1-second silence buffer...")
    t0 = time.perf_counter()
    predict(warmup_path, model_or_model_path=_model_path)
    elapsed = time.perf_counter() - t0
    logger.info("Warmup inference completed in %.2fs", elapsed)

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
        Conversion options (confidence, note length, pitch bends, quantization,
        post-processing, and metadata fields).
    """
    from basic_pitch.inference import predict

    job_log = logging.getLogger(f"midi.job.{job_id}")

    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 10,
        "message": "Starting MIDI conversion",
    })

    model_path = _get_model_path()

    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 25,
        "message": "Running pitch detection",
    })

    min_confidence = float(options.get("min_confidence", 0.5))
    min_note_length_ms = int(options.get("min_note_length_ms", 58))
    include_pitch_bends = bool(options.get("include_pitch_bends", True))
    quantize_enabled = bool(options.get("quantize", False))
    quantize_bpm = int(options.get("quantize_bpm", 120))
    quantize_grid = str(options.get("quantize_grid", "1/16"))

    min_confidence = max(0.05, min(0.95, min_confidence))
    min_note_length_ms = max(10, min(500, min_note_length_ms))
    quantize_bpm = max(40, min(300, quantize_bpm))

    t_start = time.perf_counter()

    _model_output, midi_data, note_events = predict(
        str(input_path),
        model_or_model_path=model_path,
        onset_threshold=min_confidence,
        frame_threshold=max(0.1, min_confidence - 0.2),
        minimum_note_length=min_note_length_ms,
        multiple_pitch_bends=include_pitch_bends,
    )

    inference_time_seconds = round(time.perf_counter() - t_start, 3)

    job_log.info(
        "Inference complete: %.2fs, %d raw note events",
        inference_time_seconds,
        len(note_events),
    )

    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 65,
        "message": "Building note list",
    })

    min_duration_s = min_note_length_ms / 1000.0
    piano_roll_notes: list[dict] = []

    for event in note_events:
        start_s = float(event[0])
        end_s = float(event[1])
        pitch = int(event[2])
        amplitude = float(event[3])
        velocity = (
            int(round(amplitude * 127))
            if amplitude <= 1.0
            else int(amplitude)
        )
        duration = end_s - start_s

        if duration < min_duration_s:
            continue

        velocity = max(0, min(127, velocity))

        piano_roll_notes.append({
            "pitch": pitch,
            "start": round(start_s, 4),
            "duration": round(duration, 4),
            "velocity": velocity,
        })

    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 80,
        "message": "Refining notes",
    })

    piano_roll_notes, post_metrics = apply_post_process(
        piano_roll_notes,
        options,
        quantize=quantize_enabled,
        quantize_bpm=quantize_bpm,
        quantize_grid=quantize_grid,
    )

    duration_seconds = midi_data.get_end_time() if midi_data.instruments else 0.0
    if piano_roll_notes:
        duration_seconds = max(
            duration_seconds,
            max(n["start"] + n["duration"] for n in piano_roll_notes),
        )

    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 90,
        "message": "Writing MIDI file",
    })

    analysis = analyze_notes(piano_roll_notes, duration_seconds)

    output_path = out_dir / OUTPUT_FILENAME
    export_bpm = quantize_bpm if quantize_enabled else (analysis.get("suggested_bpm") or 120)
    write_notes_to_midi(
        piano_roll_notes,
        output_path,
        bpm=int(export_bpm),
    )

    if post_metrics.get("quantization_applied"):
        job_log.info(
            "Quantization applied: grid=%s, bpm=%d, strength=%.2f, %d notes",
            quantize_grid,
            quantize_bpm,
            post_metrics.get("quantize_strength", 1.0),
            len(piano_roll_notes),
        )

    notes_detected = len(piano_roll_notes)
    tracks = 1 if piano_roll_notes else 0

    if notes_detected == 0:
        job_log.info("Zero notes detected for job %s (completed with empty result)", job_id)

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
            "analysis": analysis,
            "post_process": post_metrics,
        },
    })

    import json as _json
    from datetime import datetime, timezone

    metadata = {
        "job_id": job_id,
        "stem_job_id": options.get("stem_job_id"),
        "stem_name": options.get("stem_name"),
        "user_id": options.get("user_id"),
        "notes_detected": notes_detected,
        "duration_seconds": round(duration_seconds, 2),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "settings": {
            "min_confidence": min_confidence,
            "min_note_length_ms": min_note_length_ms,
            "include_pitch_bends": include_pitch_bends,
            "quantize": quantize_enabled,
            "quantize_grid": quantize_grid,
            "quantize_bpm": quantize_bpm,
            "normalize_velocity": options.get("normalize_velocity", True),
            "target_velocity": options.get("target_velocity", 90),
            "max_note_length_ms": options.get("max_note_length_ms", 0),
            "quantize_strength": options.get("quantize_strength", 1.0),
        },
        "analysis": analysis,
    }
    (out_dir / "metadata.json").write_text(_json.dumps(metadata), encoding="utf-8")

    job_log.info(
        "Job %s completed: %d notes, %.2fs inference, key=%s, output at %s",
        job_id,
        notes_detected,
        inference_time_seconds,
        analysis.get("estimated_key"),
        output_path,
    )
