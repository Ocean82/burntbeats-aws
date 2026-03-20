#!/usr/bin/env bash
# Copy stem models from your bank into project models/ (no symlinks).
# Usage: STEM_MODELS_SOURCE=/path/to/stem-models bash scripts/copy-models.sh
#    or: bash scripts/copy-models.sh /path/to/stem-models
# Example (WSL): STEM_MODELS_SOURCE="/mnt/d/DAW Collection/stem-models" bash scripts/copy-models.sh

set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
if [ -f .venv/bin/activate ]; then source .venv/bin/activate; fi
MODELS_DIR="$ROOT/models"

SOURCE="${STEM_MODELS_SOURCE:-$1}"
# Fallback: use flow-models inside repo if present (e.g. you copied stem-models/flow-models into repo)
if [ -z "$SOURCE" ] || [ ! -d "$SOURCE" ]; then
  if [ -d "$ROOT/models/flow-models" ] && [ -f "$ROOT/models/flow-models/htdemucs.pth" ]; then
    SOURCE="$ROOT/models/flow-models"
    echo "Using models/flow-models as source (no STEM_MODELS_SOURCE or path given)."
  else
    echo "Usage: STEM_MODELS_SOURCE=/path/to/stem-models bash scripts/copy-models.sh"
    echo "   or: bash scripts/copy-models.sh /path/to/stem-models"
    echo "Example (WSL): STEM_MODELS_SOURCE=\"/mnt/d/DAW Collection/stem-models\" bash scripts/copy-models.sh"
    echo "If models/flow-models/htdemucs.pth exists, run without args to copy from flow-models."
    exit 1
  fi
fi

echo "Copying models from: $SOURCE"
echo "Destination: $MODELS_DIR"
echo ""

mkdir -p "$MODELS_DIR"

# 1. htdemucs (required). Pip demucs only loads .th from --repo; we use .pth and auto-copy to .th.
#    Check SOURCE root, then SOURCE/flow-models/ (deep stem-models layout).
HTDEMUCS_SRC=""
if [ -f "$SOURCE/htdemucs.pth" ]; then
  HTDEMUCS_SRC="$SOURCE/htdemucs.pth"
elif [ -f "$SOURCE/htdemucs.th" ]; then
  HTDEMUCS_SRC="$SOURCE/htdemucs.th"
elif [ -f "$SOURCE/flow-models/htdemucs.pth" ]; then
  HTDEMUCS_SRC="$SOURCE/flow-models/htdemucs.pth"
elif [ -f "$SOURCE/flow-models/demucs/ckpt/EMBER-DEMUCS-SEPARATOR-ALT.pth" ]; then
  HTDEMUCS_SRC="$SOURCE/flow-models/demucs/ckpt/EMBER-DEMUCS-SEPARATOR-ALT.pth"
fi
if [ -n "$HTDEMUCS_SRC" ]; then
  cp -f "$HTDEMUCS_SRC" "$MODELS_DIR/htdemucs.pth"
  cp -f "$HTDEMUCS_SRC" "$MODELS_DIR/htdemucs.th"
  echo "OK models/htdemucs.pth + htdemucs.th (from $(dirname "$HTDEMUCS_SRC")/)"
else
  echo "WARNING: No htdemucs.pth or .th at source root, flow-models/, or flow-models/demucs/ckpt/"
fi

# 2. MDX_Net_Models/ (for future hybrid backend)
if [ -d "$SOURCE/MDX_Net_Models" ]; then
  mkdir -p "$MODELS_DIR/MDX_Net_Models"
  cp -Rf "$SOURCE/MDX_Net_Models/"* "$MODELS_DIR/MDX_Net_Models/"
  echo "OK models/MDX_Net_Models/"
else
  echo "WARNING: Missing $SOURCE/MDX_Net_Models"
fi

# 3. mdxnet_models/ from all-uvr-models/mdxnet_models-onnx/
if [ -d "$SOURCE/all-uvr-models/mdxnet_models-onnx" ]; then
  mkdir -p "$MODELS_DIR/mdxnet_models"
  cp -Rf "$SOURCE/all-uvr-models/mdxnet_models-onnx/"* "$MODELS_DIR/mdxnet_models/"
  echo "OK models/mdxnet_models/ (from all-uvr-models/mdxnet_models-onnx)"
else
  echo "WARNING: Missing $SOURCE/all-uvr-models/mdxnet_models-onnx"
fi

# 4. Silero VAD (ONNX; for USE_VAD_PRETRIM pre-trim)
if [ -f "$SOURCE/silero_vad.onnx" ]; then
  cp -f "$SOURCE/silero_vad.onnx" "$MODELS_DIR/silero_vad.onnx"
  echo "OK models/silero_vad.onnx"
elif [ -f "$SOURCE/silero_vad.jit" ]; then
  echo "WARNING: Only silero_vad.jit found; pipeline now uses silero_vad.onnx — convert or copy the ONNX file"
fi

# 5. Root-level ONNX (optional; app also checks mdxnet_models/ and MDX_Net_Models/)
for onnx in Kim_Vocal_2.onnx UVR-MDX-NET-Inst_HQ_5.onnx UVR-MDX-NET-Voc_FT.onnx; do
  if [ -f "$SOURCE/$onnx" ]; then
    cp -f "$SOURCE/$onnx" "$MODELS_DIR/$onnx"
    echo "OK models/$onnx (from source root)"
  fi
done

echo ""
# Refresh models inventory so INVENTORY.md is up to date
if [ -f "$ROOT/scripts/build_models_inventory.py" ]; then
  python "$ROOT/scripts/build_models_inventory.py" 2>/dev/null || true
fi
echo "Done."
