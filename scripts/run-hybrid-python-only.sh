#!/usr/bin/env bash
# Run hybrid pipeline using Python only (no Rust). Good for testing or when Rust isn't built.
# Uses: Stage1 (Demucs 2-stem) + phase inversion (Python) + Stage2 (Demucs 4-stem on instrumental).
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export STEM_OUTPUT_DIR="${STEM_OUTPUT_DIR:-$ROOT/tmp/stems}"
mkdir -p "$STEM_OUTPUT_DIR"

if [ ! -f .venv/bin/activate ]; then
  echo "Create venv first: python3 -m venv .venv"
  exit 1
fi
source .venv/bin/activate
export PYTHONPATH="${PYTHONPATH:-$ROOT}"

if ! python -c "import uvicorn" 2>/dev/null; then
  pip install -r stem_service/requirements.txt
fi

# FastAPI server with STEM_BACKEND=hybrid (Stage1 + inversion + Stage2)
export STEM_BACKEND=hybrid
echo "Stem service (Python hybrid) at http://localhost:5000"
exec python -m uvicorn stem_service.server:app --host 0.0.0.0 --port 5000
