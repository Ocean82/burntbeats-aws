"""Job directories, progress.json, and upload validation."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from speech_service.config import MAX_FILE_SIZE_MB, SPEECH_OUTPUT_DIR

logger = logging.getLogger(__name__)

PROGRESS_FILENAME = "progress.json"
OUTPUT_FILENAME = "enhanced.wav"
SUPPORTED_AUDIO_FORMATS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"}
MIN_SAMPLE_RATE = 8000
MAX_SAMPLE_RATE = 48000


def safe_job_path(job_id: str, *parts: str) -> Path:
    candidate = (
        SPEECH_OUTPUT_DIR / job_id / Path(*parts)
        if parts
        else SPEECH_OUTPUT_DIR / job_id
    ).resolve()
    if not str(candidate).startswith(str(SPEECH_OUTPUT_DIR.resolve())):
        raise ValueError(f"Path traversal detected for job_id: {job_id}")
    return candidate


def write_progress(out_dir: Path, data: dict) -> None:
    (out_dir / PROGRESS_FILENAME).write_text(json.dumps(data), encoding="utf-8")


def _probe_sample_rate(path: Path) -> int:
    """Return native sample rate; soundfile first, librosa fallback for AAC/MP3/M4A."""
    import soundfile as sf

    try:
        return int(sf.info(str(path)).samplerate)
    except Exception:
        import librosa

        _, sr = librosa.load(str(path), sr=None, mono=True, duration=1.0)
        return int(sr)


def validate_audio_file(path: Path) -> None:
    if not path.is_file():
        raise ValueError("Uploaded file missing")
    size_mb = path.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"File exceeds {MAX_FILE_SIZE_MB}MB limit")

    ext = path.suffix.lower()
    if ext not in SUPPORTED_AUDIO_FORMATS:
        raise ValueError(f"Unsupported format {ext}")

    samplerate = _probe_sample_rate(path)
    if samplerate < MIN_SAMPLE_RATE or samplerate > MAX_SAMPLE_RATE:
        raise ValueError(
            f"Sample rate {samplerate}Hz not in supported range "
            f"({MIN_SAMPLE_RATE}–{MAX_SAMPLE_RATE}Hz)"
        )
