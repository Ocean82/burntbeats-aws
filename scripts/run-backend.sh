#!/usr/bin/env bash
# Backend API (Node). Ubuntu/WSL — same script works on AWS. Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export STEM_OUTPUT_DIR="${STEM_OUTPUT_DIR:-$ROOT/tmp/stems}"
export SPEECH_OUTPUT_DIR="${SPEECH_OUTPUT_DIR:-$ROOT/tmp/speech}"
export MIDI_OUTPUT_DIR="${MIDI_OUTPUT_DIR:-$ROOT/tmp/midi}"
# Use 127.0.0.1 so backend (same host) reaches Python services without IPv6/localhost issues
export STEM_SERVICE_URL="${STEM_SERVICE_URL:-http://127.0.0.1:5000}"
export SPEECH_SERVICE_URL="${SPEECH_SERVICE_URL:-http://127.0.0.1:5001}"
export MIDI_SERVICE_URL="${MIDI_SERVICE_URL:-http://127.0.0.1:5002}"
mkdir -p "$STEM_OUTPUT_DIR" "$SPEECH_OUTPUT_DIR" "$MIDI_OUTPUT_DIR"
if command -v realpath >/dev/null 2>&1; then
  MIDI_OUTPUT_RESOLVED="$(realpath "$MIDI_OUTPUT_DIR" 2>/dev/null || echo "$MIDI_OUTPUT_DIR")"
else
  MIDI_OUTPUT_RESOLVED="$MIDI_OUTPUT_DIR"
fi

cd backend
# Optional: load backend/.env so PORT and CORS match server (e.g. PORT=8001)
if [ -f .env ]; then set -a; . ./.env; set +a; fi
# run-all-local.sh sets this so backend port matches frontend VITE_API_BASE_URL (default 3001)
if [ "${BURNTBEATS_LOCAL_STACK:-}" = "1" ]; then
  export PORT="${BURNTBEATS_LOCAL_STACK_PORT:-3001}"
fi
if [ ! -d node_modules ]; then
  echo "Installing backend deps..."
  npm install
fi
echo "Backend at http://localhost:${PORT:-3001}"
echo "  STEM_SERVICE_URL=$STEM_SERVICE_URL"
echo "  SPEECH_SERVICE_URL=$SPEECH_SERVICE_URL"
echo "  MIDI_SERVICE_URL=$MIDI_SERVICE_URL"
echo "  MIDI_OUTPUT_DIR=$MIDI_OUTPUT_DIR"
echo "  MIDI_OUTPUT_RESOLVED=$MIDI_OUTPUT_RESOLVED"
echo "  JOB_TOKEN_SECRET=$([ -n "${JOB_TOKEN_SECRET:-}" ] && echo enabled || echo disabled)"
echo "  MIDI_SERVICE_API_TOKEN=$([ -n "${MIDI_SERVICE_API_TOKEN:-}" ] && echo enabled || echo disabled)"
exec node server.js
