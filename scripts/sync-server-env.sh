#!/usr/bin/env bash
set -euo pipefail
REPO="${REPO:-/home/ubuntu/burntbeats-aws}"
cd "$REPO"

append_if_missing() {
  local file="$1" key="$2"
  shift 2
  touch "$file"
  if grep -qE "^${key}=" "$file" || grep -qE "^# *${key}=" "$file"; then
    echo "  skip $key ($file)"
    return 0
  fi
  echo "  add $key -> $file"
  { echo ""; echo "# --- env sync $(date -u +%Y-%m-%d) ---"; printf '%s\n' "$@"; } >> "$file"
}

append_if_missing frontend/.env.example VITE_SPEECH_MAX_UPLOAD_BYTES \
  "# Optional: max speech upload bytes (must match speech_service SPEECH_MAX_UPLOAD_MB). Default 104857600 (100MB)." \
  "# VITE_SPEECH_MAX_UPLOAD_BYTES=104857600"

append_if_missing backend/.env.example MIDI_SERVICE_URL \
  "# MIDI service URL (default http://127.0.0.1:5002)." \
  "MIDI_SERVICE_URL=http://127.0.0.1:5002"
append_if_missing backend/.env.example MIDI_OUTPUT_DIR \
  "# MIDI_OUTPUT_DIR=/path/to/burntbeats-aws/tmp/midi"
append_if_missing backend/.env.example STEM_SERVICE_API_TOKEN \
  "# STEM_SERVICE_API_TOKEN="
append_if_missing backend/.env.example SPEECH_SERVICE_API_TOKEN \
  "# SPEECH_SERVICE_API_TOKEN="
append_if_missing backend/.env.example MIDI_SERVICE_API_TOKEN \
  "# MIDI_SERVICE_API_TOKEN="
append_if_missing backend/.env.example MIDI_TOKEN_COST \
  "# MIDI_TOKEN_COST=0.5"
append_if_missing backend/.env.example MIDI_RENDER_TOKEN_COST \
  "# MIDI_RENDER_TOKEN_COST=2"

mkdir -p midi_service
if [[ ! -s midi_service/.env.example ]]; then
  cat > midi_service/.env.example <<'EOF'
# midi_service — Compose reads root .env for MIDI_SERVICE_API_TOKEN, etc.
MIDI_OUTPUT_DIR=../tmp/midi
MIDI_SERVICE_API_TOKEN=
MIDI_MAX_UPLOAD_MB=100
MIDI_MAX_QUEUE_DEPTH=8
MIDI_DEVICE=cpu
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:3000
EOF
  echo "  created midi_service/.env.example"
fi

append_if_missing backend/.env SPEECH_SERVICE_URL "SPEECH_SERVICE_URL=http://127.0.0.1:5001"
append_if_missing backend/.env MIDI_SERVICE_URL "MIDI_SERVICE_URL=http://127.0.0.1:5002"
append_if_missing backend/.env STEM_SERVICE_API_TOKEN "# STEM_SERVICE_API_TOKEN="
append_if_missing backend/.env SPEECH_SERVICE_API_TOKEN "# SPEECH_SERVICE_API_TOKEN="
append_if_missing backend/.env MIDI_SERVICE_API_TOKEN "# MIDI_SERVICE_API_TOKEN="
append_if_missing backend/.env MIDI_OUTPUT_DIR "# MIDI_OUTPUT_DIR=/home/ubuntu/burntbeats-aws/tmp/midi"
append_if_missing backend/.env MIDI_TOKEN_COST "# MIDI_TOKEN_COST=0.5"
append_if_missing backend/.env MIDI_RENDER_TOKEN_COST "# MIDI_RENDER_TOKEN_COST=2"
append_if_missing backend/.env CLERK_WEBHOOK_SIGNING_SECRET "# CLERK_WEBHOOK_SIGNING_SECRET="
append_if_missing backend/.env DEV_BYPASS_UPLOAD_AUTH "DEV_BYPASS_UPLOAD_AUTH=0"
append_if_missing backend/.env PUBLIC_BASE_URL "# PUBLIC_BASE_URL=https://burntbeats.com"
append_if_missing backend/.env USAGE_SIGNUP_WELCOME_TOKENS "# USAGE_SIGNUP_WELCOME_TOKENS=5"
append_if_missing backend/.env SENTRY_DSN "# SENTRY_DSN="
append_if_missing backend/.env SENTRY_ENVIRONMENT "# SENTRY_ENVIRONMENT=production"

append_if_missing frontend/.env VITE_GA_MEASUREMENT_ID "# VITE_GA_MEASUREMENT_ID="
append_if_missing frontend/.env VITE_SENTRY_DSN "# VITE_SENTRY_DSN="
append_if_missing frontend/.env VITE_SENTRY_ENVIRONMENT "# VITE_SENTRY_ENVIRONMENT=production"
append_if_missing frontend/.env VITE_SENTRY_RELEASE "# VITE_SENTRY_RELEASE="
append_if_missing frontend/.env VITE_STRIPE_PACKAGE_PRICING_TABLE_ID "# VITE_STRIPE_PACKAGE_PRICING_TABLE_ID="
append_if_missing frontend/.env VITE_SPEECH_MAX_UPLOAD_BYTES "# VITE_SPEECH_MAX_UPLOAD_BYTES=104857600"

append_if_missing .env STEM_SERVICE_API_TOKEN "# STEM_SERVICE_API_TOKEN="
append_if_missing .env MIDI_SERVICE_API_TOKEN "# MIDI_SERVICE_API_TOKEN="
append_if_missing .env MIDI_MAX_QUEUE_DEPTH "MIDI_MAX_QUEUE_DEPTH=8"
append_if_missing .env MIDI_RENDER_TOKEN_COST "# MIDI_RENDER_TOKEN_COST=2"
append_if_missing .env SPEECH_SERVICE_API_TOKEN "# SPEECH_SERVICE_API_TOKEN="
append_if_missing .env SPEECH_DEVICE "SPEECH_DEVICE=cpu"
append_if_missing .env SPEECH_MAX_UPLOAD_MB "SPEECH_MAX_UPLOAD_MB=100"
append_if_missing .env DEV_BYPASS_UPLOAD_AUTH "DEV_BYPASS_UPLOAD_AUTH=0"

append_if_missing stem_service/.env STEM_CPU_WORKERS "STEM_CPU_WORKERS=1"
append_if_missing stem_service/.env STEM_CPU_THREADS "STEM_CPU_THREADS=2"
append_if_missing stem_service/.env STEM_CPU_INTEROP_THREADS "STEM_CPU_INTEROP_THREADS=1"

echo "Done."
