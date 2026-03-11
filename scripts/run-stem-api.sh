#!/usr/bin/env bash
# Stem API (Rust hybrid: Stage1 Python + phase inversion Rust + Stage2 Python). WSL/Ubuntu.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export REPO_ROOT="$ROOT"
export STEM_OUTPUT_DIR="${STEM_OUTPUT_DIR:-$ROOT/tmp/stems}"
export PYTHON="${PYTHON:-python3}"
mkdir -p "$STEM_OUTPUT_DIR"

if [ ! -f .venv/bin/activate ]; then
  echo "Create venv first: python3 -m venv .venv"
  exit 1
fi
source .venv/bin/activate

if ! python -c "import stem_service.hybrid" 2>/dev/null; then
  echo "Ensure stem_service is on PYTHONPATH (run from repo root)"
fi

if ! command -v cargo &>/dev/null; then
  echo "Rust toolchain required: install from https://rustup.rs"
  exit 1
fi

cargo build --release --manifest-path stem_api/Cargo.toml
echo "Stem API (hybrid) at http://localhost:5000"
exec stem_api/target/release/stem_api
