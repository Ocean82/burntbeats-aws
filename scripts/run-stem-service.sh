#!/usr/bin/env bash
# Stem service (Python/Demucs). Ubuntu/WSL — same script works on AWS. Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export STEM_OUTPUT_DIR="${STEM_OUTPUT_DIR:-$ROOT/tmp/stems}"
mkdir -p "$STEM_OUTPUT_DIR"

if [ ! -f .venv/bin/activate ]; then
  echo "Create venv first: python3 -m venv .venv"
  exit 1
fi
source .venv/bin/activate
export PYTHONPATH="${PYTHONPATH:-$ROOT}"

if ! python -c "import uvicorn" 2>/dev/null; then
  echo "Installing stem_service deps (requires network)..."
  pip install -r stem_service/requirements.txt
fi

echo "Stem service at http://localhost:5000 (output: $STEM_OUTPUT_DIR)"
exec python -m uvicorn stem_service.server:app --host 0.0.0.0 --port 5000
