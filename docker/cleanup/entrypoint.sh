#!/bin/sh
# Cleanup sidecar: periodically calls TTL cleanup endpoints to remove old job data.
# Runs every CLEANUP_INTERVAL_HOURS (default 6) hours.

set -e

BACKEND_URL="${BACKEND_URL:-http://backend:3001}"
API_KEY="${API_KEY:-}"
STEM_MAX_AGE_HOURS="${STEM_MAX_AGE_HOURS:-48}"
MIDI_MAX_AGE_HOURS="${MIDI_MAX_AGE_HOURS:-24}"
CLEANUP_INTERVAL_HOURS="${CLEANUP_INTERVAL_HOURS:-6}"
INTERVAL_SECONDS=$((CLEANUP_INTERVAL_HOURS * 3600))

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [cleanup] $*"
}

# Wait for backend to be healthy before starting cleanup loop
wait_for_backend() {
  local retries=30
  while [ $retries -gt 0 ]; do
    if curl -fsS "${BACKEND_URL}/api/health" > /dev/null 2>&1; then
      log "Backend is healthy"
      return 0
    fi
    retries=$((retries - 1))
    log "Waiting for backend... (${retries} retries left)"
    sleep 10
  done
  log "ERROR: Backend not reachable after 5 minutes"
  exit 1
}

run_cleanup() {
  log "Starting cleanup cycle"

  # Stem cleanup
  local stem_result
  stem_result=$(curl -sS -w "\n%{http_code}" \
    -X POST \
    -H "x-api-key: ${API_KEY}" \
    "${BACKEND_URL}/api/stems/cleanup?maxAgeHours=${STEM_MAX_AGE_HOURS}" 2>&1) || true
  local stem_status=$(echo "$stem_result" | tail -1)
  local stem_body=$(echo "$stem_result" | sed '$d')
  log "Stem cleanup: HTTP ${stem_status} — ${stem_body}"

  # MIDI cleanup
  local midi_result
  midi_result=$(curl -sS -w "\n%{http_code}" \
    -X POST \
    -H "x-api-key: ${API_KEY}" \
    "${BACKEND_URL}/api/midi/cleanup?maxAgeHours=${MIDI_MAX_AGE_HOURS}" 2>&1) || true
  local midi_status=$(echo "$midi_result" | tail -1)
  local midi_body=$(echo "$midi_result" | sed '$d')
  log "MIDI cleanup: HTTP ${midi_status} — ${midi_body}"

  log "Cleanup cycle complete. Next run in ${CLEANUP_INTERVAL_HOURS}h."
}

# Main loop
wait_for_backend
log "Cleanup sidecar started (interval=${CLEANUP_INTERVAL_HOURS}h, stem_max_age=${STEM_MAX_AGE_HOURS}h, midi_max_age=${MIDI_MAX_AGE_HOURS}h)"

while true; do
  run_cleanup
  sleep "${INTERVAL_SECONDS}"
done
