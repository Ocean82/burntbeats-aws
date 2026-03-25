#!/usr/bin/env bash
# Build a tarball of the app for AWS (or any Linux host) without dev junk or models/.
# Models are gitignored and huge — copy only what you need with scripts/copy-models.sh
# on the server (or rsync models/ separately). See docs/DEPLOY-SERVER-BUNDLE.md
#
# Usage (from repo root, WSL/Ubuntu):
#   bash scripts/package-server-bundle.sh
# Optional:
#   DEPLOY_BUNDLE_OUT=/path/to/out.tgz bash scripts/package-server-bundle.sh

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
STAMP=$(date +%Y%m%d-%H%M%S)
DEFAULT_OUT="$ROOT/tmp/deploy/burntbeats-server-${STAMP}.tgz"
OUT="${DEPLOY_BUNDLE_OUT:-$DEFAULT_OUT}"

mkdir -p "$(dirname "$OUT")"

if [[ ! -f "$ROOT/scripts/deploy-exclude.txt" ]]; then
  echo "Missing scripts/deploy-exclude.txt" >&2
  exit 1
fi

echo "Packaging repo root: $ROOT"
echo "Output: $OUT"
echo "Excludes: scripts/deploy-exclude.txt (no models/, no node_modules/, no .venv/, …)"
echo ""

tar \
  --exclude-from="$ROOT/scripts/deploy-exclude.txt" \
  -czf "$OUT" \
  -C "$ROOT" \
  .

echo ""
ls -lh "$OUT"
echo ""
echo "Next on the server:"
echo "  1. scp this tarball to the host and extract: tar xzf $(basename "$OUT")"
echo "  2. mkdir -p models && bash scripts/copy-models.sh /path/to/stem-models-bank"
echo "     (or rsync your pre-built models/ tree — see docs/DEPLOY-SERVER-BUNDLE.md)"
echo "  3. backend: npm ci && copy backend/.env.example → .env and set secrets"
echo "  4. stem_service: python3 -m venv .venv && source .venv/bin/activate && pip install -r stem_service/requirements.txt"
echo "  5. frontend: npm ci && npm run build (set VITE_* via .env before build)"
echo ""
