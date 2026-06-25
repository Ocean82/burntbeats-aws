"""Job directories, progress.json, and upload validation."""

from __future__ import annotations

import logging
from pathlib import Path

from burntbeats_common.audio import SUPPORTED_AUDIO_FORMATS, validate_audio_file as _shared_validate_audio_file
from burntbeats_common.storage import PROGRESS_FILENAME, safe_job_path as _safe_job_path, write_progress as _write_progress
from speech_service.config import MAX_FILE_SIZE_MB, SPEECH_OUTPUT_DIR

logger = logging.getLogger(__name__)

OUTPUT_FILENAME = "enhanced.wav"
MIN_SAMPLE_RATE = 8000
MAX_SAMPLE_RATE = 48000


def safe_job_path(job_id: str, *parts: str) -> Path:
    return _safe_job_path(SPEECH_OUTPUT_DIR, job_id, *parts)


write_progress = _write_progress


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
    _shared_validate_audio_file(path)

    size_mb = path.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"File exceeds {MAX_FILE_SIZE_MB}MB limit")

    samplerate = _probe_sample_rate(path)
    if samplerate < MIN_SAMPLE_RATE or samplerate > MAX_SAMPLE_RATE:
        raise ValueError(
            f"Sample rate {samplerate}Hz not in supported range "
            f"({MIN_SAMPLE_RATE}–{MAX_SAMPLE_RATE}Hz)"
        )
