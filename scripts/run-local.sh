#!/usr/bin/env bash
# Run all services for local verification. Execute from repo root.
# Terminal 1 (WSL): stem service
# Terminal 2: backend
# Terminal 3: frontend

set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

echo "=== Burnt Beats local run ==="
echo "Repo root: $ROOT"
echo ""

# Ensure .venv exists and deps installed
if [ ! -f .venv/bin/activate ]; then
  echo "Create venv first: python3 -m venv .venv"
  exit 1
fi
source .venv/bin/activate
if ! python -c "import demucs" 2>/dev/null; then
  echo "Installing stem_service deps (may take several minutes)..."
  pip install -r stem_service/requirements.txt
fi

# Ensure shared output dir exists (backend will serve from here)
mkdir -p "$ROOT/tmp/stems"
export STEM_OUTPUT_DIR="$ROOT/tmp/stems"

echo "Starting stem service on http://localhost:5000"
exec python -m uvicorn stem_service.server:app --host 0.0.0.0 --port 5000
