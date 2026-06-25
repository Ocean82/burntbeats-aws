"""Runtime paths and device selection for speech_service."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

SPEECH_MODELS_DIR = Path(
    os.environ.get("SPEECH_MODELS_DIR", str(REPO_ROOT / "speech_models"))
)
SPEECH_OUTPUT_DIR = Path(
    os.environ.get("SPEECH_OUTPUT_DIR", str(REPO_ROOT / "tmp" / "speech"))
)

MAX_FILE_SIZE_MB = int(os.environ.get("SPEECH_MAX_UPLOAD_MB", "100"))
MAX_QUEUE_DEPTH = int(os.environ.get("SPEECH_MAX_QUEUE_DEPTH", "8"))

SPEECH_DEVICE = os.environ.get("SPEECH_DEVICE", "cpu").strip().lower()
