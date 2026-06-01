#!/usr/bin/env bash
# Stem service (Python/Demucs). Ubuntu/WSL — same script works on AWS. Run from repo root.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export STEM_OUTPUT_DIR="${STEM_OUTPUT_DIR:-$ROOT/tmp/stems}"
mkdir -p "$STEM_OUTPUT_DIR"

# CPU budget: keep one source of truth and let the Python service fan it out to
# ONNX, Torch, and BLAS env vars. Override these for local profiling.
export STEM_CPU_THREADS="${STEM_CPU_THREADS:-$(nproc 2>/dev/null || echo 4)}"
export STEM_CPU_WORKERS="${STEM_CPU_WORKERS:-1}"
export STEM_CPU_INTEROP_THREADS="${STEM_CPU_INTEROP_THREADS:-1}"

export PYTHONPATH="${PYTHONPATH:-$ROOT}"

if command -v uv >/dev/null 2>&1; then
  uv sync --package burntbeats-stem
elif [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  if ! python -c "import uvicorn" 2>/dev/null; then
    echo "Installing stem_service deps (requires network; prefer: uv sync --package burntbeats-stem)..."
    pip install -r stem_service/requirements.txt
  fi
else
  echo "Install deps with: uv sync --package burntbeats-stem"
  echo "Or create .venv: python3 -m venv .venv && source .venv/bin/activate"
  exit 1
fi

# Warn if required models missing (avoids timeout then error on first split)
if ! bash scripts/check-models.sh; then
  echo "Stem service will start but split requests will fail until models are present."
fi

echo "Stem service at http://${STEM_SERVICE_HOST:-127.0.0.1}:5000 (output: $STEM_OUTPUT_DIR)"
echo "Stem CPU budget: workers=${STEM_CPU_WORKERS} job_threads=${STEM_CPU_THREADS} interop=${STEM_CPU_INTEROP_THREADS}"
mkdir -p "$ROOT/logs"
# Production safety: bind to localhost by default so the Python service is not reachable
# from the public internet. The backend Node proxy runs on the same host.
STEM_SERVICE_HOST="${STEM_SERVICE_HOST:-127.0.0.1}"
echo "Stem service bind host: ${STEM_SERVICE_HOST}"
if command -v uv >/dev/null 2>&1; then
  UV_RUN=(uv run)
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
  UV_RUN=()
fi
exec "${UV_RUN[@]}" python -m uvicorn stem_service.server:app \
  --host "${STEM_SERVICE_HOST}" --port 5000 --log-level info \
  2>&1 | tee -a "$ROOT/logs/stem-service.log"
