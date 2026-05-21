"""
Musical analysis for transcribed piano-roll note events.

Pure-Python (numpy only) — no external analyzer scripts required.
"""

from __future__ import annotations

from typing import Any

import numpy as np

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

# Krumhansl-Kessler key profiles (major / minor)
_KK_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    dtype=np.float64,
)
_KK_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    dtype=np.float64,
)


def _pitch_name(pitch: int) -> str:
    return f"{NOTE_NAMES[pitch % 12]}{pitch // 12 - 1}"


def _estimate_key(pitches: np.ndarray) -> str:
    """Estimate key (e.g. 'C major') from pitch-class histogram."""
    if pitches.size == 0:
        return "unknown"

    chroma = np.zeros(12, dtype=np.float64)
    for p in pitches:
        chroma[int(p) % 12] += 1.0
    if chroma.sum() <= 0:
        return "unknown"
    chroma /= chroma.sum()

    best_key = "C"
    best_mode = "major"
    best_score = -1.0

    for tonic in range(12):
        rolled = np.roll(chroma, -tonic)
        major_corr = float(np.corrcoef(rolled, _KK_MAJOR)[0, 1])
        minor_corr = float(np.corrcoef(rolled, _KK_MINOR)[0, 1])
        if not np.isfinite(major_corr):
            major_corr = 0.0
        if not np.isfinite(minor_corr):
            minor_corr = 0.0
        if major_corr > best_score:
            best_score = major_corr
            best_key = NOTE_NAMES[tonic]
            best_mode = "major"
        if minor_corr > best_score:
            best_score = minor_corr
            best_key = NOTE_NAMES[tonic]
            best_mode = "minor"

    return f"{best_key} {best_mode}"


def _suggest_bpm(starts: np.ndarray) -> int | None:
    """
    Estimate tempo from note-onset spacing.

    Tries common beat subdivisions and returns BPM in a sensible range, or None.
    """
    if starts.size < 2:
        return None

    sorted_starts = np.sort(starts)
    deltas = np.diff(sorted_starts)
    deltas = deltas[deltas >= 0.05]
    if deltas.size == 0:
        return None

    median_ioi = float(np.median(deltas))
    if median_ioi <= 0:
        return None

    candidates: list[float] = []
    for beat_fraction in (1.0, 0.5, 0.25):
        bpm = 60.0 / (median_ioi / beat_fraction)
        if 60 <= bpm <= 200:
            candidates.append(bpm)

    if not candidates:
        bpm = 60.0 / median_ioi
        if bpm < 60:
            bpm *= 2
        if bpm > 200:
            bpm /= 2
        if not (60 <= bpm <= 200):
            return None
        candidates.append(bpm)

    return int(round(min(candidates, key=lambda x: abs(x - 120))))


def _complexity_score(
    pitches: np.ndarray,
    note_count: int,
    duration_seconds: float,
    velocities: np.ndarray,
) -> float:
    """Heuristic complexity score in [0, 1]."""
    if note_count == 0 or duration_seconds <= 0:
        return 0.0

    pitch_span = int(pitches.max() - pitches.min()) if pitches.size else 0
    density = note_count / duration_seconds
    vel_std = float(np.std(velocities)) if velocities.size > 1 else 0.0

    span_factor = min(1.0, pitch_span / 36.0)
    density_factor = min(1.0, density / 8.0)
    vel_factor = min(1.0, vel_std / 40.0)

    return round(min(1.0, 0.4 * span_factor + 0.35 * density_factor + 0.25 * vel_factor), 3)


def analyze_notes(
    notes: list[dict],
    duration_seconds: float,
) -> dict[str, Any]:
    """
    Analyze transcribed notes for UI insights and quantize BPM hints.

    Returns a JSON-serializable dict included in the conversion result.
    """
    if not notes:
        return {
            "estimated_key": "unknown",
            "scale": "unknown",
            "pitch_range": {"min": 0, "max": 0, "min_name": "-", "max_name": "-"},
            "note_density": 0.0,
            "suggested_bpm": None,
            "complexity_score": 0.0,
            "total_notes": 0,
        }

    pitches = np.array([int(n["pitch"]) for n in notes], dtype=np.int32)
    velocities = np.array([int(n["velocity"]) for n in notes], dtype=np.int32)
    starts = np.array([float(n["start"]) for n in notes], dtype=np.float64)

    min_p = int(pitches.min())
    max_p = int(pitches.max())
    dur = max(float(duration_seconds), 0.01)
    estimated_key = _estimate_key(pitches)
    scale = "minor" if "minor" in estimated_key else "major" if "major" in estimated_key else "unknown"

    return {
        "estimated_key": estimated_key,
        "scale": scale,
        "pitch_range": {
            "min": min_p,
            "max": max_p,
            "min_name": _pitch_name(min_p),
            "max_name": _pitch_name(max_p),
        },
        "note_density": round(len(notes) / dur, 2),
        "suggested_bpm": _suggest_bpm(starts),
        "complexity_score": _complexity_score(pitches, len(notes), dur, velocities),
        "total_notes": len(notes),
    }
