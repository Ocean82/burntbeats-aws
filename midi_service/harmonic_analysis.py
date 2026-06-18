"""
Harmonic analysis — chord detection and key confidence from note events.

Pure-Python (numpy only). Groups notes into bars and detects chords
using interval matching against quality templates.
"""

from __future__ import annotations

from typing import Any

import numpy as np

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

# Chord quality templates as semitone intervals from root (0 = root)
CHORD_TEMPLATES: dict[str, set[int]] = {
    "": {0, 4, 7},
    "m": {0, 3, 7},
    "dim": {0, 3, 6},
    "aug": {0, 4, 8},
    "sus2": {0, 2, 7},
    "sus4": {0, 5, 7},
    "7": {0, 4, 7, 10},
    "m7": {0, 3, 7, 10},
    "maj7": {0, 4, 7, 11},
    "dim7": {0, 3, 6, 9},
    "m7b5": {0, 3, 6, 10},
    "aug7": {0, 4, 8, 10},
    "7sus4": {0, 5, 7, 10},
    "6": {0, 4, 7, 9},
    "m6": {0, 3, 7, 9},
    "9": {0, 4, 7, 10, 14},
    "maj9": {0, 4, 7, 11, 14},
    "m9": {0, 3, 7, 10, 14},
}

# Krumhansl-Kessler key profiles
_KK_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    dtype=np.float64,
)
_KK_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    dtype=np.float64,
)


def _pitch_class_set(notes: list[int]) -> set[int]:
    return {int(p) % 12 for p in notes}


def _detect_chord(pitches: list[int]) -> dict[str, Any]:
    """
    Detect best-matching chord from a set of pitches.

    Returns chord name, root, quality, and confidence.
    """
    pc_set = _pitch_class_set(pitches)
    if len(pc_set) < 2:
        return {"chord": "—", "root": None, "quality": None, "confidence": 0.0}

    best_name = ""
    best_root = 0
    best_quality = ""
    best_score = 0.0

    for root in range(12):
        intervals = {(p - root) % 12 for p in pc_set}
        for quality, template in CHORD_TEMPLATES.items():
            # Score: fraction of template intervals present in the note set
            intersection = intervals & template
            if not intersection:
                continue
            # Prefer matches that include the root
            root_match = 1.0 if 0 in intervals else 0.5
            coverage = len(intersection) / len(template)
            # Penalize extra notes not in template
            extras = len(intervals - template)
            extra_penalty = max(0, 1.0 - extras * 0.15)
            score = coverage * root_match * extra_penalty

            if score > best_score:
                best_score = score
                best_root = root
                best_quality = quality
                best_name = f"{NOTE_NAMES[root]}{quality}"

    return {
        "chord": best_name if best_score > 0.2 else "—",
        "root": NOTE_NAMES[best_root] if best_score > 0.2 else None,
        "quality": best_quality if best_score > 0.2 else None,
        "confidence": round(best_score, 3),
    }


def estimate_key_with_confidence(pitches: list[int]) -> dict[str, Any]:
    """
    Estimate key with confidence score using Krumhansl-Kessler profiles.

    Returns key name, mode, and correlation-based confidence.
    """
    if not pitches:
        return {"key": "unknown", "mode": "unknown", "confidence": 0.0}

    chroma = np.zeros(12, dtype=np.float64)
    for p in pitches:
        chroma[int(p) % 12] += 1.0
    if chroma.sum() <= 0:
        return {"key": "unknown", "mode": "unknown", "confidence": 0.0}
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

    return {
        "key": f"{best_key} {best_mode}",
        "mode": best_mode,
        "confidence": round(max(0.0, best_score), 3),
    }


def group_notes_into_bars(
    notes: list[dict[str, Any]],
    bpm: float,
    beats_per_bar: int = 4,
) -> list[list[dict[str, Any]]]:
    """Group note events into bars based on BPM and time signature."""
    if not notes:
        return []
    seconds_per_beat = 60.0 / bpm
    seconds_per_bar = seconds_per_beat * beats_per_bar

    sorted_notes = sorted(notes, key=lambda n: float(n.get("start", 0)))
    max_time = max(float(n.get("start", 0)) + float(n.get("duration", 0)) for n in sorted_notes)
    bar_count = max(1, int(np.ceil(max_time / seconds_per_bar)))

    bars: list[list[dict[str, Any]]] = [[] for _ in range(bar_count)]
    for n in sorted_notes:
        start = float(n.get("start", 0))
        bar_idx = min(int(start / seconds_per_bar), bar_count - 1)
        bars[bar_idx].append(n)
    return bars


def analyze_harmony(
    notes: list[dict[str, Any]],
    bpm: float = 120.0,
    time_signature: str = "4/4",
) -> dict[str, Any]:
    """
    Full harmonic analysis of note events.

    Returns key estimate with confidence, per-bar chord labels,
    chord progression summary, and bar-by-bar details.
    """
    parts = time_signature.split("/")
    beats_per_bar = int(parts[0]) if len(parts) == 2 else 4

    all_pitches = [int(n.get("pitch", 60)) for n in notes]

    key_info = estimate_key_with_confidence(all_pitches)

    bars = group_notes_into_bars(notes, bpm, beats_per_bar)

    bar_analysis: list[dict[str, Any]] = []
    seen_chords: list[str] = []

    for i, bar_notes in enumerate(bars):
        bar_pitches = sorted({int(n.get("pitch", 60)) for n in bar_notes})
        chord_result = _detect_chord(bar_pitches)
        bar_analysis.append({
            "bar": i + 1,
            "chord": chord_result["chord"],
            "confidence": chord_result["confidence"],
            "pitches": bar_pitches,
            "note_count": len(bar_notes),
            "root": chord_result["root"],
            "quality": chord_result["quality"],
        })
        if chord_result["chord"] != "—":
            seen_chords.append(chord_result["chord"])

    unique_chords = []
    for c in seen_chords:
        if not unique_chords or c != unique_chords[-1]:
            unique_chords.append(c)

    return {
        "key": key_info["key"],
        "key_confidence": key_info["confidence"],
        "mode": key_info["mode"],
        "bar_count": len(bars),
        "bars": bar_analysis,
        "chord_progression": " — ".join(unique_chords) if unique_chords else "—",
        "total_notes": len(notes),
    }
