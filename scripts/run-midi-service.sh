#!/usr/bin/env bash
# MIDI conversion service (Basic Pitch). Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

# Optional local overrides for the MIDI service.
if [ -f midi_service/.env ]; then
  set -a
  . midi_service/.env
  set +a
fi

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
if command -v realpath >/dev/null 2>&1; then
  MIDI_OUTPUT_RESOLVED="$(realpath "$MIDI_OUTPUT_DIR" 2>/dev/null || echo "$MIDI_OUTPUT_DIR")"
else
  MIDI_OUTPUT_RESOLVED="$MIDI_OUTPUT_DIR"
fi
echo "MIDI service at http://${MIDI_SERVICE_HOST}:5002"
echo "  MIDI_OUTPUT_DIR=$MIDI_OUTPUT_DIR"
echo "  MIDI_OUTPUT_RESOLVED=$MIDI_OUTPUT_RESOLVED"
echo "  MIDI_SERVICE_API_TOKEN=$([ -n "${MIDI_SERVICE_API_TOKEN:-}" ] && echo enabled || echo disabled)"
mkdir -p "$ROOT/logs"
exec python -m uvicorn midi_service.server:app \
  --host "${MIDI_SERVICE_HOST}" --port 5002 --log-level info \
  2>&1 | tee -a "$ROOT/logs/midi-service.log"
