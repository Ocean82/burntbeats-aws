#!/usr/bin/env bash
# Check that required stem-split models exist. Run from repo root.
# Exit 0 if OK, 1 if missing (with instructions).
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
MODELS="$ROOT/models"

if [ ! -d "$MODELS" ]; then
  echo "ERROR: models/ directory not found at $MODELS"
  echo "Create it and add models: see README.md"
  exit 1
fi

FAIL=0

# htdemucs — required for 4-stem Stage 2 / fallback
if [ -f "$MODELS/htdemucs.th" ] || [ -f "$MODELS/htdemucs.pth" ]; then
  echo "OK: htdemucs model found (required for stem splitting)"
else
  echo "ERROR: No htdemucs model in models/"
  echo "  Run: python scripts/download_htdemucs_official.py"
  echo "  Or copy htdemucs.pth / htdemucs.th into models/"
  FAIL=1
fi

# Kim_Vocal_2 — primary vocal ONNX (Stage 1)
VOCAL_FOUND=0
for p in \
  "$MODELS/mdxnet_models/Kim_Vocal_2.onnx" \
  "$MODELS/MDX_Net_Models/Kim_Vocal_2.onnx" \
  "$MODELS/Kim_Vocal_2.onnx"; do
  if [ -f "$p" ]; then
    echo "OK: Kim_Vocal_2.onnx found ($p)"
    VOCAL_FOUND=1
    break
  fi
done
if [ "$VOCAL_FOUND" -eq 0 ]; then
  echo "WARNING: Kim_Vocal_2.onnx not found — Stage 1 vocal ONNX unavailable (will fall back to Demucs 2-stem)"
fi

# Inst_HQ_4 — primary instrumental ONNX (Stage 1)
INST_FOUND=0
for p in \
  "$MODELS/mdxnet_models/UVR-MDX-NET-Inst_HQ_4.onnx" \
  "$MODELS/MDX_Net_Models/UVR-MDX-NET-Inst_HQ_4.onnx" \
  "$MODELS/UVR-MDX-NET-Inst_HQ_4.onnx"; do
  if [ -f "$p" ]; then
    echo "OK: UVR-MDX-NET-Inst_HQ_4.onnx found ($p)"
    INST_FOUND=1
    break
  fi
done
if [ "$INST_FOUND" -eq 0 ]; then
  echo "WARNING: UVR-MDX-NET-Inst_HQ_4.onnx not found — instrumental ONNX unavailable (will use phase inversion)"
fi

if [ "$FAIL" -eq 1 ]; then
  exit 1
fi
echo "Model check passed."
