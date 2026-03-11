#!/usr/bin/env bash
# Run segment tests so models load and run correctly. Ubuntu/WSL. Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

if [ ! -f .venv/bin/activate ]; then
  echo "Create venv first: python3 -m venv .venv"
  exit 1
fi
source .venv/bin/activate
export PYTHONPATH="${PYTHONPATH:-$ROOT}"
export PYTHONUNBUFFERED=1

python scripts/check_segments.py
