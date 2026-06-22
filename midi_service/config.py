"""Runtime paths and device selection for midi_service."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

MIDI_OUTPUT_DIR = Path(
    os.environ.get("MIDI_OUTPUT_DIR", str(REPO_ROOT / "tmp" / "midi"))
)

MIDI_SERVICE_API_TOKEN: str = os.environ.get("MIDI_SERVICE_API_TOKEN", "")

from burntbeats_common.auth import validate_service_token_at_startup

validate_service_token_at_startup("MIDI_SERVICE_API_TOKEN", MIDI_SERVICE_API_TOKEN)

SUPPORTED_AUDIO_FORMATS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"}
MAX_FILE_SIZE_MB = int(os.environ.get("MIDI_MAX_UPLOAD_MB", "100"))
MAX_QUEUE_DEPTH = int(os.environ.get("MIDI_MAX_QUEUE_DEPTH", "8"))

# CPU-only deployment; GPU values are ignored (Basic Pitch uses ONNX CPU).
MIDI_DEVICE = os.environ.get("MIDI_DEVICE", "cpu").strip().lower()

FRONTEND_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.environ.get(
        "FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")
    if origin.strip()
]

# ── MIDI-to-audio render (FluidSynth) ────────────────────────────────────────
SOUNDFONT_DIR = Path(os.environ.get("SOUNDFONT_DIR", str(REPO_ROOT / "soundfonts")))
DEFAULT_SOUNDFONT: str = os.environ.get("DEFAULT_SOUNDFONT", "GeneralUser_GS.sf2")
