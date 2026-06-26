#!/usr/bin/env bash
# Push .env files from local .server-sync/ snapshots to EC2.
# Run from repo root:  bash .server-sync/apply_env_patches.sh
#
# What it does:
#   1. Uploads the .server-sync/ env snapshots to a staging dir on the server
#   2. Runs sync-server-env.sh on the server to append any missing keys
#   3. Optionally restarts Docker Compose services that consume changed files
#
# Prerequisites:
#   - SSH key at $SSH_KEY (default: ~/.ssh/server_saver_key)
#   - SERVER set in environment, or edit the default below
#   - .server-sync/*.env files contain your server's current env values
#
# Usage:
#   bash .server-sync/apply_env_patches.sh              # push + patch, no restart
#   RESTART=1 bash .server-sync/apply_env_patches.sh   # push + patch + docker compose up -d

set -euo pipefail

SERVER="${SERVER:-ubuntu@52.0.207.242}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/server_saver_key}"
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/burntbeats-aws}"
SYNC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTART="${RESTART:-0}"

SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
SCP="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

echo "=== Burnt Beats — env sync to $SERVER ==="
echo ""

# ── 1. Verify SSH connection ───────────────────────────────────────────────────
echo "→ Checking SSH connection..."
$SSH "$SERVER" "echo '  connected'" || {
  echo "ERROR: Cannot reach $SERVER with key $SSH_KEY"
  exit 1
}

# ── 2. Validate local snapshot files exist ────────────────────────────────────
echo "→ Checking local snapshot files..."
MISSING_FILES=()
for f in ".env" "root__.env.example" "backend__.env" "backend__.env.example" \
         "frontend__.env" "frontend__.env.example" \
         "stem_service__.env" "stem_service__.env.example" \
         "speech_service__.env.example"; do
  if [[ ! -f "$SYNC_DIR/$f" ]]; then
    MISSING_FILES+=("$f")
  fi
done

if [[ ${#MISSING_FILES[@]} -gt 0 ]]; then
  echo "  WARNING: Missing snapshot files (will be skipped):"
  for f in "${MISSING_FILES[@]}"; do
    echo "    - .server-sync/$f"
  done
fi

# ── 3. Run compare first so you can see what will change ──────────────────────
echo ""
echo "→ Key comparison (local snapshots vs server .env files):"
python3 "$SYNC_DIR/compare_env.py" 2>/dev/null || echo "  (compare_env.py skipped — Python3 not found locally)"

# ── 4. Confirm before pushing ─────────────────────────────────────────────────
echo ""
if [[ "${AUTO_CONFIRM:-0}" != "1" ]]; then
  read -r -p "Push env files to $SERVER? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

# ── 5. Push snapshot .env files to staging area on server ─────────────────────
echo ""
echo "→ Uploading .server-sync snapshots to server staging area..."
$SSH "$SERVER" "mkdir -p $REMOTE_DIR/.server-sync"

# Push each file that exists locally
push_if_exists() {
  local local_file="$SYNC_DIR/$1"
  local remote_file="$REMOTE_DIR/.server-sync/$1"
  if [[ -f "$local_file" ]]; then
    $SCP "$local_file" "$SERVER:$remote_file"
    echo "  uploaded: $1"
  fi
}

push_if_exists ".env"
push_if_exists "root__.env.example"
push_if_exists "backend__.env"
push_if_exists "backend__.env.example"
push_if_exists "frontend__.env"
push_if_exists "frontend__.env.example"
push_if_exists "stem_service__.env"
push_if_exists "stem_service__.env.example"
push_if_exists "speech_service__.env.example"

# ── 6. Apply snapshots to actual .env locations on server ─────────────────────
echo ""
echo "→ Applying snapshots to server .env files..."
$SSH "$SERVER" bash << REMOTE
set -euo pipefail
cd $REMOTE_DIR

copy_if_newer() {
  local src="\$1" dst="\$2"
  if [[ -f "\$src" ]]; then
    cp "\$src" "\$dst"
    echo "  applied: \$dst"
  fi
}

# Root .env (Compose reads this)
copy_if_newer .server-sync/.env .env

# Service-level .env files
copy_if_newer .server-sync/backend__.env backend/.env
copy_if_newer .server-sync/frontend__.env frontend/.env
copy_if_newer .server-sync/stem_service__.env stem_service/.env

echo "  done applying snapshots"
REMOTE

# ── 7. Run sync-server-env.sh to append any new keys ─────────────────────────
echo ""
echo "→ Running sync-server-env.sh to append missing keys..."
$SSH "$SERVER" "cd $REMOTE_DIR && bash scripts/sync-server-env.sh"

# ── 8. Optional: restart services ─────────────────────────────────────────────
if [[ "$RESTART" == "1" ]]; then
  echo ""
  echo "→ Restarting Docker Compose services..."
  $SSH "$SERVER" "cd $REMOTE_DIR && sudo docker compose up -d"
  echo ""
  echo "→ Container status:"
  $SSH "$SERVER" "cd $REMOTE_DIR && sudo docker compose ps"
fi

echo ""
echo "=== Done ==="
echo ""
echo "Verify on server:"
echo "  ssh -i $SSH_KEY $SERVER 'cd $REMOTE_DIR && cat .env | grep -v SECRET | grep -v KEY'"
echo ""
echo "To restart services after an env change:"
echo "  RESTART=1 bash .server-sync/apply_env_patches.sh"
