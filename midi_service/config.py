"""Runtime paths and configuration for midi_service."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

MIDI_OUTPUT_DIR = Path(
    os.environ.get("MIDI_OUTPUT_DIR", str(REPO_ROOT / "tmp" / "midi"))
)

SUPPORTED_AUDIO_FORMATS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"}
MAX_FILE_SIZE_MB = int(os.environ.get("MIDI_MAX_UPLOAD_MB", "100"))
MAX_QUEUE_DEPTH = int(os.environ.get("MIDI_MAX_QUEUE_DEPTH", "4"))

# Basic Pitch runs on CPU by default — no device config needed.
# Inference is lightweight (~2-8 seconds for a typical stem).
