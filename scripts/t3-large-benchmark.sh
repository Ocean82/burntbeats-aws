#!/usr/bin/env bash
# Benchmark + quality regression profile for AWS t3.large (2 vCPU / 8 GiB), CPU-only.
# Run from repo root: bash scripts/t3-large-benchmark.sh /path/to/song.wav
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

# First arg, or BENCHMARK_SONG env, or repo benchmark_song.local.txt (first non-comment line)
INPUT_FILE="${1:-}"
if [ -z "$INPUT_FILE" ] && [ -n "${BENCHMARK_SONG:-}" ]; then
  INPUT_FILE="$BENCHMARK_SONG"
fi
if [ -z "$INPUT_FILE" ] && [ -f "$ROOT/benchmark_song.local.txt" ]; then
  INPUT_FILE="$(grep -v '^[[:space:]]*#' "$ROOT/benchmark_song.local.txt" | head -n1 | tr -d '\r')"
fi
if [ -z "$INPUT_FILE" ]; then
  echo "Usage: bash scripts/t3-large-benchmark.sh /path/to/song.wav"
  echo "Or set BENCHMARK_SONG, or create benchmark_song.local.txt (see benchmark_song.local.example.txt)"
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
export STEM_CPU_WORKERS="${STEM_CPU_WORKERS:-1}"
export STEM_CPU_THREADS="${STEM_CPU_THREADS:-2}"
export STEM_CPU_INTEROP_THREADS="${STEM_CPU_INTEROP_THREADS:-1}"
echo "=== t3.large profile ==="
echo "USE_GPU=$USE_GPU"
echo "USE_ONNX_CPU=$USE_ONNX_CPU"
echo "STEM_CPU_WORKERS=$STEM_CPU_WORKERS"
echo "STEM_CPU_THREADS=$STEM_CPU_THREADS"
echo "STEM_CPU_INTEROP_THREADS=$STEM_CPU_INTEROP_THREADS"
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
