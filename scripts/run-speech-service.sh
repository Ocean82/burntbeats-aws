#!/usr/bin/env bash
# Speech enhancement service (LavaSR). Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export SPEECH_OUTPUT_DIR="${SPEECH_OUTPUT_DIR:-$ROOT/tmp/speech}"
export SPEECH_MODELS_DIR="${SPEECH_MODELS_DIR:-$ROOT/speech_models}"
mkdir -p "$SPEECH_OUTPUT_DIR"

export PYTHONPATH="${PYTHONPATH:-$ROOT/Speech:$ROOT}"

if command -v uv >/dev/null 2>&1; then
  uv sync --package burntbeats-speech
elif [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  if ! python -c "import uvicorn" 2>/dev/null; then
    echo "Installing speech_service deps (prefer: uv sync --package burntbeats-speech)..."
    pip install -r speech_service/requirements.txt \
      --extra-index-url https://download.pytorch.org/whl/cpu
  fi
else
  echo "Install deps with: uv sync --package burntbeats-speech"
  exit 1
fi

if [ ! -f "$SPEECH_MODELS_DIR/enhancer_v2/config.yaml" ]; then
  echo "Warning: speech models missing under $SPEECH_MODELS_DIR (see speech_models/LAYOUT.txt)."
  echo "Run: bash scripts/fetch-speech-models.sh"
fi

SPEECH_SERVICE_HOST="${SPEECH_SERVICE_HOST:-127.0.0.1}"
echo "Speech service at http://${SPEECH_SERVICE_HOST}:5001 (models: $SPEECH_MODELS_DIR)"
mkdir -p "$ROOT/logs"
if command -v uv >/dev/null 2>&1; then
  UV_RUN=(uv run)
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
  UV_RUN=()
fi
exec "${UV_RUN[@]}" python -m uvicorn speech_service.server:app \
  --host "${SPEECH_SERVICE_HOST}" --port 5001 --log-level info \
  2>&1 | tee -a "$ROOT/logs/speech-service.log"
