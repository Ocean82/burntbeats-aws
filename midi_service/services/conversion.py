from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from midi_service.analysis import analyze_notes
from midi_service.midi_io import write_notes_to_midi
from midi_service.post_process import apply_post_process
from midi_service.services.midi_artifact_analysis import analyze_midi_artifact
from midi_service.services.model_runtime import get_model_path
from midi_service.services.storage import OUTPUT_FILENAME, write_metadata, write_progress

from midi_service.job_queue import is_job_cancelled


def build_metadata_payload(
    *,
    job_id: str,
    options: dict[str, Any],
    notes_detected: int,
    duration_seconds: float,
    analysis: dict[str, Any],
    min_confidence: float,
    min_note_length_ms: int,
    include_pitch_bends: bool,
    quantize_enabled: bool,
    quantize_grid: str,
    quantize_bpm: int,
    created_at: str,
    midi_file_analysis: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "job_id": job_id,
        "stem_job_id": options.get("stem_job_id"),
        "stem_name": options.get("stem_name"),
        "user_id": options.get("user_id"),
        "notes_detected": notes_detected,
        "duration_seconds": round(duration_seconds, 2),
        "created_at": created_at,
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
            "transpose": options.get("transpose", 0),
        },
        "analysis": analysis,
    }
    if midi_file_analysis is not None:
        payload["midi_file_analysis"] = midi_file_analysis
    return payload


def run_conversion_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    options: dict[str, Any],
) -> None:
    from basic_pitch.inference import predict

    job_log = logging.getLogger(f"midi.job.{job_id}")

    write_progress(out_dir, {
        "status": "processing",
        "job_id": job_id,
        "progress": 10,
        "message": "Starting MIDI conversion",
    })

    model_path = get_model_path()

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

    if is_job_cancelled(job_id):
        raise RuntimeError("Job cancelled")

    import threading
    from concurrent.futures import ThreadPoolExecutor

    heartbeat_stop = threading.Event()
    heartbeat_value = 25

    def _analysis_heartbeat() -> None:
        nonlocal heartbeat_value
        while not heartbeat_stop.wait(2.5):
            if is_job_cancelled(job_id):
                heartbeat_stop.set()
                return
            heartbeat_value = min(heartbeat_value + 5, 60)
            write_progress(out_dir, {
                "status": "processing",
                "job_id": job_id,
                "progress": heartbeat_value,
                "message": "Analyzing audio…",
            })

    heartbeat_thread = threading.Thread(target=_analysis_heartbeat, daemon=True)
    heartbeat_thread.start()

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                predict,
                str(input_path),
                model_or_model_path=model_path,
                onset_threshold=min_confidence,
                frame_threshold=max(0.1, min_confidence - 0.2),
                minimum_note_length=min_note_length_ms,
                multiple_pitch_bends=include_pitch_bends,
            )
            _model_output, midi_data, note_events = future.result()
    finally:
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=1.0)

    if is_job_cancelled(job_id):
        raise RuntimeError("Job cancelled")

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
    midi_file_analysis = analyze_midi_artifact(output_path)

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

    empty_transcription = notes_detected == 0
    if empty_transcription:
        job_log.info("Zero notes detected for job %s (completed with empty result)", job_id)

    completed_progress: dict[str, Any] = {
        "status": "completed",
        "job_id": job_id,
        "progress": 100,
        "message": "No notes detected" if empty_transcription else "Conversion complete",
        "empty_transcription": empty_transcription,
        "midi_file_analysis": midi_file_analysis,
        "result": {
            "notes_detected": notes_detected,
            "duration_seconds": round(duration_seconds, 2),
            "tracks": tracks,
            "inference_time_seconds": inference_time_seconds,
            "piano_roll_notes": piano_roll_notes,
            "analysis": analysis,
            "post_process": post_metrics,
            "midi_file_analysis": midi_file_analysis,
        },
    }
    if empty_transcription:
        completed_progress["warning"] = "No notes detected"

    write_progress(out_dir, completed_progress)

    metadata = build_metadata_payload(
        job_id=job_id,
        options=options,
        notes_detected=notes_detected,
        duration_seconds=duration_seconds,
        analysis=analysis,
        min_confidence=min_confidence,
        min_note_length_ms=min_note_length_ms,
        include_pitch_bends=include_pitch_bends,
        quantize_enabled=quantize_enabled,
        quantize_grid=quantize_grid,
        quantize_bpm=quantize_bpm,
        created_at=datetime.now(timezone.utc).isoformat(),
        midi_file_analysis=midi_file_analysis,
    )
    write_metadata(out_dir, metadata)

    job_log.info(
        "Job %s completed: %d notes, %.2fs inference, key=%s, output at %s",
        job_id,
        notes_detected,
        inference_time_seconds,
        analysis.get("estimated_key"),
        output_path,
    )
