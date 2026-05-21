"""
Post-processing for transcribed MIDI note events.

Applied after Basic Pitch inference: velocity normalization, duration caps,
optional grid quantization with blend strength, and overlap merging.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def parse_post_process_options(options: dict[str, Any]) -> dict[str, Any]:
    """Normalize conversion options with safe defaults and clamps."""
    normalize = options.get("normalize_velocity", True)
    if isinstance(normalize, str):
        normalize = normalize.strip().lower() in ("true", "1", "yes")

    target_velocity = int(options.get("target_velocity", 90))
    target_velocity = max(1, min(127, target_velocity))

    max_note_ms = int(options.get("max_note_length_ms", 0))
    max_note_ms = max(0, min(60_000, max_note_ms))

    strength = float(options.get("quantize_strength", 1.0))
    strength = max(0.0, min(1.0, strength))

    return {
        "normalize_velocity": bool(normalize),
        "target_velocity": target_velocity,
        "max_note_length_ms": max_note_ms,
        "quantize_strength": strength,
    }


def filter_by_max_duration(
    notes: list[dict],
    max_duration_s: float,
) -> tuple[list[dict], int]:
    """Drop notes longer than max_duration_s. Returns (notes, removed_count)."""
    if max_duration_s <= 0:
        return notes, 0
    kept: list[dict] = []
    removed = 0
    for note in notes:
        if float(note["duration"]) > max_duration_s:
            removed += 1
        else:
            kept.append(note)
    return kept, removed


def normalize_velocities(
    notes: list[dict],
    target_velocity: int = 90,
) -> list[dict]:
    """
    Scale velocities so the peak maps to target_velocity, preserving dynamics.

    Quiet notes stay relatively quiet; overall level is consistent for export.
    """
    if not notes:
        return notes
    peak = max(int(n["velocity"]) for n in notes)
    if peak <= 0:
        return [{**n, "velocity": target_velocity} for n in notes]
    scale = target_velocity / peak
    out: list[dict] = []
    for note in notes:
        vel = int(round(int(note["velocity"]) * scale))
        out.append({**note, "velocity": max(1, min(127, vel))})
    return out


def _grid_size_seconds(bpm: int, grid: str) -> float:
    denom = int(grid.split("/")[1])
    return (4.0 / denom) * (60.0 / bpm)


def quantize_notes_with_strength(
    notes: list[dict],
    bpm: int,
    grid: str,
    strength: float = 1.0,
) -> list[dict]:
    """
    Snap note timing to a musical grid.

    strength=1.0 fully quantizes; strength=0.0 leaves timing unchanged.
    """
    if not notes or strength <= 0:
        return list(notes)

    grid_size = _grid_size_seconds(bpm, grid)
    strength = max(0.0, min(1.0, strength))

    quantized: list[dict] = []
    for note in notes:
        start = float(note["start"])
        duration = float(note["duration"])
        snapped_start = round(start / grid_size) * grid_size
        snapped_end = round((start + duration) / grid_size) * grid_size
        full_start = round(snapped_start, 4)
        full_end = round(max(snapped_end, snapped_start + grid_size), 4)
        full_duration = round(full_end - full_start, 4)

        if strength >= 1.0:
            new_start, new_duration = full_start, full_duration
        else:
            new_start = round(start + (full_start - start) * strength, 4)
            new_end = round(
                (start + duration) + (full_end - (start + duration)) * strength,
                4,
            )
            new_duration = round(max(new_end - new_start, grid_size * 0.25), 4)

        quantized.append({
            **note,
            "start": new_start,
            "duration": new_duration,
        })

    quantized.sort(key=lambda n: (n["pitch"], n["start"]))
    merged: list[dict] = []
    for note in quantized:
        if merged and merged[-1]["pitch"] == note["pitch"]:
            prev = merged[-1]
            prev_end = prev["start"] + prev["duration"]
            if note["start"] <= prev_end + 0.001:
                new_end = max(prev_end, note["start"] + note["duration"])
                prev["duration"] = round(new_end - prev["start"], 4)
                prev["velocity"] = max(prev["velocity"], note["velocity"])
                continue
        merged.append(note)
    return merged


def transpose_notes(notes: list[dict], semitones: int) -> list[dict]:
    """
    Shift all note pitches by the given number of semitones.

    Notes that would go out of MIDI range (0-127) are clamped.
    """
    if not notes or semitones == 0:
        return notes
    semitones = max(-48, min(48, semitones))
    out: list[dict] = []
    for note in notes:
        pitch = max(0, min(127, int(note["pitch"]) + semitones))
        out.append({**note, "pitch": pitch})
    return out


def apply_post_process(
    notes: list[dict],
    options: dict[str, Any],
    *,
    quantize: bool = False,
    quantize_bpm: int = 120,
    quantize_grid: str = "1/16",
) -> tuple[list[dict], dict[str, Any]]:
    """
    Run the full post-processing chain.

    Returns processed notes and metrics for the job result.
    """
    cfg = parse_post_process_options(options)
    metrics: dict[str, Any] = {
        "notes_before": len(notes),
        "notes_removed_max_length": 0,
        "velocity_normalized": False,
        "quantization_applied": False,
        "transpose_applied": 0,
    }

    if not notes:
        metrics["notes_after"] = 0
        return notes, metrics

    working = list(notes)

    if cfg["max_note_length_ms"] > 0:
        max_s = cfg["max_note_length_ms"] / 1000.0
        working, removed = filter_by_max_duration(working, max_s)
        metrics["notes_removed_max_length"] = removed

    if cfg["normalize_velocity"]:
        working = normalize_velocities(working, cfg["target_velocity"])
        metrics["velocity_normalized"] = True

    # Transpose (shift pitch by semitones)
    transpose_semitones = int(options.get("transpose", 0))
    if transpose_semitones != 0:
        working = transpose_notes(working, transpose_semitones)
        metrics["transpose_applied"] = transpose_semitones

    if quantize and cfg["quantize_strength"] > 0:
        working = quantize_notes_with_strength(
            working,
            quantize_bpm,
            quantize_grid,
            cfg["quantize_strength"],
        )
        metrics["quantization_applied"] = True
        metrics["quantize_strength"] = cfg["quantize_strength"]

    metrics["notes_after"] = len(working)
    return working, metrics
