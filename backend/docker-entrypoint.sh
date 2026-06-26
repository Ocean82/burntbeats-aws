#!/bin/sh
set -e

# Ensure bind-mounted tmp directories are writable by appuser (UID 10001).
# When Docker bind-mounts host directories, the container-side mkdir/chown from
# the Dockerfile is overridden by the host directory's ownership. This script
# runs as root to fix permissions, then drops to appuser for the actual process.

for dir in /app/tmp/stems /app/tmp/speech /app/tmp/midi; do
  mkdir -p "$dir"
  chown 10001:10001 "$dir"
done

exec su-exec appuser "$@"
