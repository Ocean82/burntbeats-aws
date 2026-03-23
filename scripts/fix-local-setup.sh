#!/usr/bin/env bash
# Fix common local setup issues:
#   1. Windows \r line endings in .env files
#   2. torch/torchaudio version mismatch (libtorchaudio.so undefined symbol)
# Run from repo root in WSL: bash scripts/fix-local-setup.sh
set -e
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "${RED}✘${NC}  $1"; }

echo "=== Burnt Beats local setup fix ==="
echo ""

# ── 1. Fix \r line endings in env files ──────────────────────────────────────
echo "── Fixing line endings ──"
for f in .env backend/.env frontend/.env; do
  if [ -f "$f" ]; then
    if grep -qP '\r' "$f" 2>/dev/null; then
      sed -i 's/\r//' "$f"
      ok "Fixed \\r in $f"
    else
      ok "$f already clean"
    fi
  else
    warn "$f not found — skipping"
  fi
done
echo ""

# ── 2. Fix torch/torchaudio mismatch ─────────────────────────────────────────
echo "── Checking torch/torchaudio compatibility ──"

if [ ! -f .venv/bin/activate ]; then
  fail "No .venv found — run: python3 -m venv .venv && source .venv/bin/activate && pip install -r stem_service/requirements.txt"
  exit 1
fi
source .venv/bin/activate

# Check if torchaudio loads cleanly
if python -c "import torchaudio" 2>/dev/null; then
  ok "torchaudio loads fine — no fix needed"
else
  warn "torchaudio failed to load — reinstalling matched torch + torchaudio..."

  # Detect CUDA availability in WSL
  CUDA_VER=""
  if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
    RAW=$(nvidia-smi | grep -oP 'CUDA Version: \K[0-9]+\.[0-9]+' | head -1)
    MAJOR=$(echo "$RAW" | cut -d. -f1)
    if   [ "$MAJOR" -ge 12 ]; then CUDA_VER="cu121"
    elif [ "$MAJOR" -ge 11 ]; then CUDA_VER="cu118"
    fi
  fi

  if [ -n "$CUDA_VER" ]; then
    INDEX_URL="https://download.pytorch.org/whl/${CUDA_VER}"
    warn "CUDA detected ($RAW) — installing GPU build ($CUDA_VER)"
  else
    INDEX_URL="https://download.pytorch.org/whl/cpu"
    ok "No CUDA detected — installing CPU build"
  fi

  pip install --force-reinstall \
    "torch>=2.0.0,<2.9" \
    "torchaudio>=2.0.0,<2.9" \
    --index-url "$INDEX_URL"

  # Verify
  if python -c "import torchaudio; print('torchaudio', torchaudio.__version__)" 2>/dev/null; then
    ok "torch + torchaudio reinstalled successfully"
  else
    fail "Still failing — check your Python/CUDA environment manually"
    exit 1
  fi
fi
echo ""

# ── 3. Quick sanity check ─────────────────────────────────────────────────────
echo "── Sanity check ──"
python -c "
import torch, torchaudio
print(f'  torch      {torch.__version__}')
print(f'  torchaudio {torchaudio.__version__}')
try:
    import onnxruntime as ort
    print(f'  onnxruntime {ort.__version__}')
except ImportError:
    print('  onnxruntime NOT installed')
try:
    import demucs
    print(f'  demucs     {demucs.__version__}')
except ImportError:
    print('  demucs NOT installed')
"
echo ""
echo "All done. Run: bash scripts/run-all-local.sh"
