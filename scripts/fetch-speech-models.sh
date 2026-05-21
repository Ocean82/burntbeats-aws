#!/usr/bin/env bash
# Download LavaSR weights into speech_models/ (CPU-friendly, ~55 MB enhancer + denoiser).
# Run on workstation or EC2 from repo root:
#   bash scripts/fetch-speech-models.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${ROOT}/speech_models"

mkdir -p "${DEST}"

if ! command -v huggingface-cli >/dev/null 2>&1; then
  echo "Installing huggingface_hub..."
  python3 -m pip install --user -q huggingface_hub
  export PATH="${HOME}/.local/bin:${PATH}"
fi

echo "Downloading YatharthS/LavaSR into ${DEST} ..."
huggingface-cli download YatharthS/LavaSR --local-dir "${DEST}" --local-dir-use-symlinks False

if [[ -f "${DEST}/enhancer_v2/config.yaml" ]]; then
  echo "OK: speech_models layout ready."
else
  echo "Download finished but enhancer_v2/config.yaml not found."
  echo "Check ${DEST} layout against speech_models/LAYOUT.txt"
  exit 1
fi
