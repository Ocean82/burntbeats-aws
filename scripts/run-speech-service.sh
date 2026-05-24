#!/usr/bin/env bash
# Speech enhancement service (LavaSR). Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export SPEECH_OUTPUT_DIR="${SPEECH_OUTPUT_DIR:-$ROOT/tmp/speech}"
export SPEECH_MODELS_DIR="${SPEECH_MODELS_DIR:-$ROOT/speech_models}"
mkdir -p "$SPEECH_OUTPUT_DIR"

if [ ! -f .venv/bin/activate ]; then
  echo "Create venv first: python3 -m venv .venv"
  exit 1
fi
source .venv/bin/activate
export PYTHONPATH="${PYTHONPATH:-$ROOT/Speech:$ROOT}"

if ! python -c "import uvicorn" 2>/dev/null; then
  echo "Installing speech_service deps (requires network)..."
  pip install -r speech_service/requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu
fi

if [ ! -f "$SPEECH_MODELS_DIR/enhancer_v2/config.yaml" ]; then
  echo "Warning: speech models missing under $SPEECH_MODELS_DIR (see speech_models/LAYOUT.txt)."
  echo "Run: bash scripts/fetch-speech-models.sh"
fi

SPEECH_SERVICE_HOST="${SPEECH_SERVICE_HOST:-127.0.0.1}"
echo "Speech service at http://${SPEECH_SERVICE_HOST}:5001 (models: $SPEECH_MODELS_DIR)"
mkdir -p "$ROOT/logs"
exec python -m uvicorn speech_service.server:app \
  --host "${SPEECH_SERVICE_HOST}" --port 5001 --log-level info \
  2>&1 | tee -a "$ROOT/logs/speech-service.log"
