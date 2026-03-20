#!/usr/bin/env bash
# Frontend production build + static preview (WSL/AWS compatible).
set -euo pipefail

cd "$(dirname "$0")/.."

cd frontend

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created frontend/.env - set VITE_API_BASE_URL to your backend URL (e.g. http://localhost:3001)"
fi

if [ ! -d node_modules ]; then
  echo "Installing frontend deps..."
  npm install
fi

echo "Building frontend (vite build)..."
npm run build

PREVIEW_PORT="${VITE_PREVIEW_PORT:-5173}"
PREVIEW_HOST="${VITE_PREVIEW_HOST:-0.0.0.0}"

echo "Serving production build (vite preview): ${PREVIEW_HOST}:${PREVIEW_PORT}"
exec npm run preview -- --host "${PREVIEW_HOST}" --port "${PREVIEW_PORT}"

