#!/usr/bin/env bash
# MIDI conversion service (Basic Pitch). Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export MIDI_OUTPUT_DIR="${MIDI_OUTPUT_DIR:-$ROOT/tmp/midi}"
mkdir -p "$MIDI_OUTPUT_DIR"

if [ ! -f .venv/bin/activate ]; then
  echo "Create venv first: python3 -m venv .venv"
  exit 1
fi
source .venv/bin/activate
export PYTHONPATH="${PYTHONPATH:-$ROOT}"

if ! python -c "import uvicorn" 2>/dev/null; then
  echo "Installing midi_service deps (requires network)..."
  pip install -r midi_service/requirements.txt
fi

MIDI_SERVICE_HOST="${MIDI_SERVICE_HOST:-127.0.0.1}"
echo "MIDI service at http://${MIDI_SERVICE_HOST}:5002 (output: $MIDI_OUTPUT_DIR)"
mkdir -p "$ROOT/logs"
exec python -m uvicorn midi_service.server:app \
  --host "${MIDI_SERVICE_HOST}" --port 5002 --log-level info \
  2>&1 | tee -a "$ROOT/logs/midi-service.log"
