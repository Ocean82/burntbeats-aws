"""Job directories, progress.json, and upload validation."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from midi_service.config import MAX_FILE_SIZE_MB, MIDI_OUTPUT_DIR, SUPPORTED_AUDIO_FORMATS

logger = logging.getLogger(__name__)

PROGRESS_FILENAME = "progress.json"
OUTPUT_FILENAME = "output.mid"
MIN_SAMPLE_RATE = 8000
MAX_SAMPLE_RATE = 48000
# Formats that libsndfile often cannot parse; validated via librosa + ffmpeg instead.
_LIBROSA_VALIDATED_EXTS = {".mp3", ".m4a", ".webm", ".aac"}


def safe_job_path(job_id: str, *parts: str) -> Path:
    """Resolve a path under MIDI_OUTPUT_DIR with path traversal prevention."""
    candidate = (
        MIDI_OUTPUT_DIR / job_id / Path(*parts)
        if parts
        else MIDI_OUTPUT_DIR / job_id
    ).resolve()
    if not str(candidate).startswith(str(MIDI_OUTPUT_DIR.resolve())):
        raise ValueError(f"Path traversal detected for job_id: {job_id}")
    return candidate


def write_progress(out_dir: Path, data: dict) -> None:
    """Write progress data as JSON to progress.json in the given directory."""
    (out_dir / PROGRESS_FILENAME).write_text(json.dumps(data), encoding="utf-8")


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
