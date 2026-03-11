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
if [ ! -d node_modules ]; then
  echo "Installing backend deps..."
  npm install
fi
echo "Backend at http://localhost:${PORT:-3001} (STEM_SERVICE_URL=$STEM_SERVICE_URL)"
exec node server.js
