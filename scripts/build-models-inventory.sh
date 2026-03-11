#!/usr/bin/env bash
# Build models/INVENTORY.md (full recursive list of dirs, files, and model weights).
# Run from repo root: bash scripts/build-models-inventory.sh
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
export PYTHONPATH="${PYTHONPATH:-$ROOT}"
python scripts/build_models_inventory.py
