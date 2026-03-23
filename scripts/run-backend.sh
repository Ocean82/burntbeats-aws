#!/usr/bin/env bash
# Backend API (Node). Ubuntu/WSL — same script works on AWS. Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export STEM_OUTPUT_DIR="${STEM_OUTPUT_DIR:-$ROOT/tmp/stems}"
# Use 127.0.0.1 so backend (same host) reaches stem service without IPv6/localhost issues
export STEM_SERVICE_URL="${STEM_SERVICE_URL:-http://127.0.0.1:5000}"
mkdir -p "$STEM_OUTPUT_DIR"

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
echo "Backend at http://localhost:${PORT:-3001} (STEM_SERVICE_URL=$STEM_SERVICE_URL)"
exec node server.js
