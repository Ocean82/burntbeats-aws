#!/usr/bin/env bash
# Frontend dev server. Ubuntu/WSL — same script works on AWS. Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

cd frontend
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created frontend/.env — set VITE_API_BASE_URL to your backend URL (e.g. http://localhost:3001)"
fi
if [ ! -d node_modules ]; then
  echo "Installing frontend deps..."
  npm install
fi
echo "Frontend dev server (Vite)..."
exec npm run dev
