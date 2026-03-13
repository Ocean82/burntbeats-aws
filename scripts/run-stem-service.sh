#!/usr/bin/env bash
# Stem service (Python/Demucs). Ubuntu/WSL — same script works on AWS. Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export STEM_OUTPUT_DIR="${STEM_OUTPUT_DIR:-$ROOT/tmp/stems}"
mkdir -p "$STEM_OUTPUT_DIR"

# CPU efficiency: limit OpenMP/MKL threads so ONNX + Demucs (sequential) don't oversubscribe.
# Override OMP_NUM_THREADS / MKL_NUM_THREADS in env to tune (e.g. physical cores on NUMA).
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-$(nproc 2>/dev/null || echo 4)}"
export MKL_NUM_THREADS="${MKL_NUM_THREADS:-$OMP_NUM_THREADS}"

if [ ! -f .venv/bin/activate ]; then
  echo "Create venv first: python3 -m venv .venv"
  exit 1
fi
source .venv/bin/activate
export PYTHONPATH="${PYTHONPATH:-$ROOT}"

# Warn if required models missing (avoids timeout then error on first split)
if ! bash scripts/check-models.sh; then
  echo "Stem service will start but split requests will fail until models are present."
fi

if ! python -c "import uvicorn" 2>/dev/null; then
  echo "Installing stem_service deps (requires network)..."
  pip install -r stem_service/requirements.txt
fi

echo "Stem service at http://localhost:5000 (output: $STEM_OUTPUT_DIR)"
exec python -m uvicorn stem_service.server:app --host 0.0.0.0 --port 5000
