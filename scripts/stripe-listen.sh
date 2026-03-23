#!/usr/bin/env bash
# Thin wrapper — see scripts/stripe-local-dev.mjs
set -e
cd "$(dirname "$0")/.."
exec node scripts/stripe-local-dev.mjs
