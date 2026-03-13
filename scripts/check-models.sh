#!/usr/bin/env bash
# Check that required stem-split models exist. Run from repo root.
# Exit 0 if OK, 1 if missing (with instructions).
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
MODELS="$ROOT/models"

if [ ! -d "$MODELS" ]; then
  echo "ERROR: models/ directory not found at $MODELS"
  echo "Create it and add htdemucs: python scripts/download_htdemucs_official.py"
  exit 1
fi

if [ -f "$MODELS/htdemucs.th" ] || [ -f "$MODELS/htdemucs.pth" ]; then
  echo "OK: htdemucs model found (required for stem splitting)"
else
  echo "ERROR: No htdemucs model in models/"
  echo "Required for stem splitting. Run from repo root:"
  echo "  python scripts/download_htdemucs_official.py"
  echo "Or copy htdemucs.pth / htdemucs.th into models/"
  exit 1
fi

echo "Model check passed."
