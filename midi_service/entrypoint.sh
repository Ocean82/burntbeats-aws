#!/bin/sh
set -e

# Fix permissions on bind-mounted tmp directories (Docker Desktop on Windows
# mounts volumes as root, but the container runs as appuser).
for d in /repo/tmp/midi /repo/tmp/stems /repo/tmp/speech; do
  if [ -d "$d" ]; then
    chmod 777 "$d" || true
  fi
done

exec "$@"
