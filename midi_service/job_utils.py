"""Job directories, progress.json, and upload validation."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from midi_service.config import MAX_FILE_SIZE_MB, MIDI_OUTPUT_DIR, SUPPORTED_AUDIO_FORMATS
from midi_service.services.storage import (
    OUTPUT_FILENAME,
    PROGRESS_FILENAME,
    safe_job_path as _safe_job_path,
    write_progress as _write_progress,
)

logger = logging.getLogger(__name__)

MIN_SAMPLE_RATE = 8000
MAX_SAMPLE_RATE = 48000
# Formats that libsndfile often cannot parse; validated via librosa + ffmpeg instead.
_LIBROSA_VALIDATED_EXTS = {".mp3", ".m4a", ".webm", ".aac"}


def safe_job_path(job_id: str, *parts: str) -> Path:
    """Resolve a path under MIDI_OUTPUT_DIR with path traversal prevention."""
    return _safe_job_path(MIDI_OUTPUT_DIR, job_id, *parts)


def write_progress(out_dir: Path, data: dict) -> None:
    """Write progress data as JSON to progress.json in the given directory."""
    _write_progress(out_dir, data)


def find_job_input_audio_path(job_dir: Path) -> Path | None:
    """Return the first upload path matching input.* inside a job directory."""
    if not job_dir.is_dir():
        return None
    for path in sorted(job_dir.iterdir()):
        if path.is_file() and path.name.startswith("input."):
            return path
    return None


def validate_audio_file(path: Path) -> None:
    """Validate that the file exists, is within size limit, has a supported format, and valid sample rate."""
    import soundfile as sf

    if not path.is_file():
        raise ValueError("Uploaded file missing")
    size_mb = path.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"File exceeds {MAX_FILE_SIZE_MB}MB limit")

    ext = path.suffix.lower()
    if ext not in SUPPORTED_AUDIO_FORMATS:
        raise ValueError(f"Unsupported format {ext}")

    try:
        info = sf.info(str(path))
        if info.samplerate < MIN_SAMPLE_RATE or info.samplerate > MAX_SAMPLE_RATE:
            raise ValueError(
                f"Sample rate {info.samplerate}Hz not in supported range "
                f"({MIN_SAMPLE_RATE}\u2013{MAX_SAMPLE_RATE}Hz)"
            )
    except Exception as sf_err:
        if ext not in _LIBROSA_VALIDATED_EXTS:
            raise ValueError(f"Cannot read audio file: {sf_err}") from sf_err
        import librosa

        try:
            duration = float(librosa.get_duration(path=str(path)))
        except Exception as lib_err:
            raise ValueError(f"Cannot read audio file: {lib_err}") from lib_err
        if duration <= 0:
            raise ValueError("Audio file has no duration")
