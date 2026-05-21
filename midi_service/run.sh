#!/usr/bin/env bash
# Local development runner for midi_service.
# Uses the midi_service-specific venv (Python 3.12) and starts uvicorn with hot-reload.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Activate the midi_service-specific venv (Python 3.12, has basic-pitch + onnxruntime)
if [ -d "$SCRIPT_DIR/.venv" ]; then
    source "$SCRIPT_DIR/.venv/bin/activate"
elif [ -d "$REPO_ROOT/.venv" ]; then
    source "$REPO_ROOT/.venv/bin/activate"
fi

cd "$REPO_ROOT"

exec uvicorn midi_service.server:app \
    --host 0.0.0.0 \
    --port 5002 \
    --reload \
    --reload-dir midi_service
