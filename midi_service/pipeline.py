"""
Compatibility wrappers around the extracted MIDI conversion services.
"""

from __future__ import annotations

from pathlib import Path

from midi_service.post_process import quantize_notes_with_strength
from midi_service.services.conversion import run_conversion_sync
from midi_service.services.model_runtime import get_model_path, preload_model as _preload_model


def quantize_notes(notes: list[dict], bpm: int, grid: str) -> list[dict]:
    """Snap notes to grid at full strength (backward-compatible helper)."""
    return quantize_notes_with_strength(notes, bpm, grid, strength=1.0)


def preload_model() -> None:
    _preload_model()


def _get_model_path():
    return get_model_path()


def run_midi_convert_sync(
    job_id: str,
    input_path: Path,
    out_dir: Path,
    options: dict,
) -> None:
    run_conversion_sync(job_id, input_path, out_dir, options)
