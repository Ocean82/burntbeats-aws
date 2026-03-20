#!/usr/bin/env bash
# Benchmark + quality regression profile for AWS t3.large (2 vCPU / 8 GiB), CPU-only.
# Run from repo root: bash scripts/t3-large-benchmark.sh /path/to/song.wav
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

INPUT_FILE="${1:-}"
if [ -z "$INPUT_FILE" ]; then
  echo "Usage: bash scripts/t3-large-benchmark.sh /path/to/song.wav"
  exit 1
fi

if [ ! -f .venv/bin/activate ]; then
  echo "Create venv first: python3 -m venv .venv"
  exit 1
fi

source .venv/bin/activate
export PYTHONPATH="${PYTHONPATH:-$ROOT}"
export PYTHONUNBUFFERED=1

# Conservative defaults for t3.large CPU-only run.
export USE_GPU=0
export USE_ONNX_CPU=1
export ONNXRUNTIME_NUM_THREADS="${ONNXRUNTIME_NUM_THREADS:-2}"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-2}"
export MKL_NUM_THREADS="${MKL_NUM_THREADS:-2}"
export USE_VAD_PRETRIM="${USE_VAD_PRETRIM:-0}"

echo "=== t3.large profile ==="
echo "USE_GPU=$USE_GPU"
echo "USE_ONNX_CPU=$USE_ONNX_CPU"
echo "ONNXRUNTIME_NUM_THREADS=$ONNXRUNTIME_NUM_THREADS"
echo "OMP_NUM_THREADS=$OMP_NUM_THREADS"
echo "MKL_NUM_THREADS=$MKL_NUM_THREADS"
echo "USE_VAD_PRETRIM=$USE_VAD_PRETRIM"
echo

echo "1) Running stem split quality regression checks..."
python scripts/test_stem_splits.py
echo

echo "2) Running model benchmark matrix (30s clip)..."
python scripts/run_model_benchmark.py "$INPUT_FILE" --output-dir "$ROOT/benchmark_out"
echo

echo "3) Generating ranking report from benchmarks + job metrics..."
python scripts/generate_model_ranking.py \
  --metrics-file "$ROOT/job_metrics.jsonl" \
  --benchmark-root "$ROOT" \
  --output "$ROOT/tmp/model_ranking_report.md"
echo

echo "Done."
echo "- Benchmark outputs: $ROOT/benchmark_out_*"
echo "- Ranking report:    $ROOT/tmp/model_ranking_report.md"
