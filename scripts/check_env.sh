#!/usr/bin/env bash
# Quick env check for WSL. Run from repo root: bash scripts/check_env.sh
set -e
cd "$(dirname "$0")/.." || exit 1
[ -f .venv/bin/activate ] && source .venv/bin/activate || true

echo "=== Python / deps ==="
python3 -c "
import torch, torchaudio, demucs
print('torch:', torch.__version__)
print('CUDA:', torch.cuda.is_available())
try:
    import onnxruntime as ort
    print('onnxruntime:', ort.__version__)
except ImportError:
    print('onnxruntime: NOT INSTALLED')
" 2>&1 || echo "Python/demucs check failed (venv not activated?)"

echo ""
echo "=== Repo root / models ==="
echo "REPO_ROOT: $(pwd)"
ls -la models/ 2>/dev/null || echo "models/ empty or missing"

echo ""
echo "=== Key model files ==="
for f in \
  "models/htdemucs.th" \
  "models/htdemucs.pth" \
  "models/mdxnet_models/Kim_Vocal_2.onnx" \
  "models/mdxnet_models/UVR-MDX-NET-Inst_HQ_4.onnx" \
  "models/mdxnet_models/Reverb_HQ_By_FoxJoy.onnx" \
  "models/silero_vad.onnx" \
  "models/scnet.onnx/scnet.onnx"; do
  if [ -f "$f" ]; then
    echo "  PRESENT: $f"
  else
    echo "  MISSING: $f"
  fi
done
