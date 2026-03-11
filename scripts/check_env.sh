#!/usr/bin/env bash
# Quick env check for WSL. Run from repo root: bash scripts/check_env.sh
set -e
cd "$(dirname "$0")/.." || exit 1
[ -f .venv/bin/activate ] && source .venv/bin/activate || true
echo "=== Python / deps ==="
PYTHON=python3
command -v python3 >/dev/null || PYTHON=python
$PYTHON -c 'import torch, torchaudio, demucs; print("torch:", torch.__version__); print("CUDA:", torch.cuda.is_available())' 2>&1 || echo "Python/demucs check failed (venv not activated?)"
echo "=== Repo root / models ==="
echo "REPO_ROOT: $(pwd)"
ls -la models/ 2>/dev/null || echo "models/ empty or missing"
test -f models/htdemucs.pth && echo "htdemucs.pth: present" || echo "htdemucs.pth: missing (Demucs will download)"
test -f models/*.onnx 2>/dev/null && echo "ONNX model(s): present" || true
