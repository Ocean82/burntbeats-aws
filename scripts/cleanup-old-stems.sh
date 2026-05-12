#!/bin/bash
# cleanup-old-stems.sh — Delete completed/failed stem job output folders older than N days.
#
# Usage:
#   bash scripts/cleanup-old-stems.sh              # uses defaults
#   STEM_CLEANUP_DAYS=14 bash scripts/cleanup-old-stems.sh  # custom retention
#
# Safety:
#   - Only deletes folders where progress.json shows a terminal status
#   - Never deletes folders without progress.json (could be in-progress)
#   - Dry-run by default when STEM_CLEANUP_DRY_RUN=1

set -euo pipefail

STEM_DIR="${STEM_OUTPUT_DIR:-$(dirname "$0")/../tmp/stems}"
MAX_AGE_DAYS="${STEM_CLEANUP_DAYS:-7}"
DRY_RUN="${STEM_CLEANUP_DRY_RUN:-0}"

# Resolve to absolute path
STEM_DIR="$(cd "$STEM_DIR" 2>/dev/null && pwd)" || {
  echo "[cleanup] Stem directory not found: $STEM_DIR"
  exit 0
}

echo "[cleanup] Scanning $STEM_DIR for jobs older than ${MAX_AGE_DAYS} days..."

deleted=0
skipped=0

find "$STEM_DIR" -maxdepth 1 -type d -mtime +"$MAX_AGE_DAYS" | while read -r dir; do
  # Skip the root directory itself
  [ "$dir" = "$STEM_DIR" ] && continue

  progress="$dir/progress.json"
  if [ ! -f "$progress" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  # Read status from progress.json
  status=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['status'])" "$progress" 2>/dev/null || echo "unknown")

  if [ "$status" = "completed" ] || [ "$status" = "failed" ] || [ "$status" = "cancelled" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "[dry-run] Would remove: $(basename "$dir") (status=$status)"
    else
      rm -rf "$dir"
      echo "[cleanup] Removed: $(basename "$dir") (status=$status)"
    fi
    deleted=$((deleted + 1))
  else
    skipped=$((skipped + 1))
  fi
done

echo "[cleanup] Done. Removed: $deleted, Skipped: $skipped"
