from __future__ import annotations

from pathlib import Path

SUPPORTED_AUDIO_FORMATS: frozenset[str] = frozenset({
    ".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".webm", ".aiff",
})
_MIN_FILE_SIZE_BYTES = 256
_MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB


def validate_audio_file(path: Path) -> None:
    if not path.is_file():
        raise ValueError("Uploaded file missing")
    ext = path.suffix.lower()
    if ext not in SUPPORTED_AUDIO_FORMATS:
        raise ValueError(f"Unsupported format {ext}")
    file_size = path.stat().st_size
    if file_size < _MIN_FILE_SIZE_BYTES:
        raise ValueError(f"File size too small ({file_size} bytes)")
    if file_size > _MAX_FILE_SIZE_BYTES:
        raise ValueError("File size exceeds 500 MB limit")
