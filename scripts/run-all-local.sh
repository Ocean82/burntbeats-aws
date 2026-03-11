#!/usr/bin/env bash
# Start stem service, backend, and frontend for local testing. Run from repo root.
# Frontend runs in foreground; stem + backend run in background. Ctrl+C stops all.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

# Ensure frontend .env points to localhost backend
if [ ! -f frontend/.env ]; then
  cp frontend/.env.example frontend/.env
  echo "Created frontend/.env with VITE_API_BASE_URL=http://localhost:3001"
fi
if ! grep -q "VITE_API_BASE_URL=http://localhost:3001" frontend/.env 2>/dev/null; then
  echo "Setting VITE_API_BASE_URL=http://localhost:3001 in frontend/.env"
  sed -i 's|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=http://localhost:3001|' frontend/.env
fi

export STEM_OUTPUT_DIR="${STEM_OUTPUT_DIR:-$ROOT/tmp/stems}"
export STEM_SERVICE_URL="${STEM_SERVICE_URL:-http://127.0.0.1:5000}"
mkdir -p "$STEM_OUTPUT_DIR"

# Free ports so a re-run can bind (e.g. after previous Ctrl+C left something running)
if command -v fuser &>/dev/null; then
  fuser -k 5000/tcp 2>/dev/null || true
  fuser -k 3001/tcp 2>/dev/null || true
  sleep 2
fi

cleanup() {
  echo ""
  echo "Stopping services..."
  [ -n "$STEM_PID" ] && kill "$STEM_PID" 2>/dev/null || true
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "=== Burnt Beats local (localhost) ==="
echo "Stem: http://localhost:5000  |  Backend: http://localhost:3001  |  Frontend: http://localhost:5173"
echo ""

bash scripts/run-stem-service.sh &
STEM_PID=$!
bash scripts/run-backend.sh &
BACKEND_PID=$!

echo "Waiting for stem and backend to bind..."
sleep 4

bash scripts/run-frontend.sh
