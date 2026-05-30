#!/usr/bin/env bash
# Download optional per-stem MDX ONNX models for intent-based routing.
# Requires: hf CLI (https://huggingface.co/docs/huggingface_hub/guides/cli)
#
# After download, probe shapes and add entries to stem_service/mdx/model_registry.py:
#   python scripts/probe_model_data.py models/models_by_type/onnx/<file>.onnx
#
# Usage:
#   ./scripts/fetch-intent-models.sh
#   STEM_MODELS_DIR=server_models ./scripts/fetch-intent-models.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${STEM_MODELS_DIR:-models}"
ONNX_DIR="$ROOT/$DEST/models_by_type/onnx"
mkdir -p "$ONNX_DIR"

REPO="${INTENT_MODELS_HF_REPO:-Blane187/all_public_uvr_models}"

echo "Target directory: $ONNX_DIR"
echo "Hugging Face repo: $REPO"
echo ""
echo "Searching for drum/bass/guitar MDX ONNX in $REPO ..."
echo "Edit DRUM_ONNX / BASS_ONNX / GUITAR_ONNX below once filenames are confirmed."
echo ""

# Set these after verifying filenames exist on the Hub (hf ls "$REPO")
DRUM_ONNX="${DRUM_ONNX:-}"
BASS_ONNX="${BASS_ONNX:-}"
GUITAR_ONNX="${GUITAR_ONNX:-}"

download_one() {
  local name="$1"
  if [[ -z "$name" ]]; then
    echo "  skip (not set): $2"
    return 0
  fi
  echo "  downloading $name ..."
  hf download "$REPO" "$name" --local-dir "$ONNX_DIR"
}

download_one "$DRUM_ONNX" "drum model"
download_one "$BASS_ONNX" "bass model"
download_one "$GUITAR_ONNX" "guitar model"

echo ""
echo "Done. List repo files with:"
echo "  hf ls $REPO | rg -i 'drum|bass|guitar'"
echo ""
echo "Then probe and register in stem_service/mdx/model_registry.py _MDX_CONFIGS"
