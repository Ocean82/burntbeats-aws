#!/usr/bin/env bash
# Apply monetization restructure env vars on production (run on EC2 after git pull).
# Usage: bash scripts/patch-prod-monetization-env.sh
set -euo pipefail
REPO="${REPO:-/home/ubuntu/burntbeats-aws}"
cd "$REPO"

patch_key() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  elif grep -qE "^# *${key}=" "$file"; then
    sed -i "s|^# *${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
  echo "  set ${key} in ${file}"
}

for f in .env backend/.env; do
  echo "Patching ${f}..."
  patch_key "$f" STRIPE_PRICE_ID_BASIC "price_1T9sQhP38C54URjE0Va7eUYl"
  patch_key "$f" STRIPE_PRICE_ID_PREMIUM "price_1T9sY3P38C54URjEQ9XHdBqm"
  patch_key "$f" STRIPE_PRICE_ID_STUDIO "price_1T9sekP38C54URjEATva0Siw"
  patch_key "$f" STRIPE_PRICE_ID_TOPUP "price_1T9sidP38C54URjEIcLojWrf"
  patch_key "$f" STRIPE_PRICE_ID_SINGLE "price_1TQmdCP38C54URjE5VEClCWA"
  patch_key "$f" STRIPE_PRICE_ID_BASIC_ANNUAL "price_1TiGaXP38C54URjEAPICkpCt"
  patch_key "$f" STRIPE_PRICE_ID_PREMIUM_ANNUAL "price_1TiGafP38C54URjE50Sg0dhW"
  patch_key "$f" STRIPE_PRICE_ID_STUDIO_ANNUAL "price_1TiGafP38C54URjEbF2CwBCT"
  patch_key "$f" STRIPE_RETENTION_COUPON_ID "ZnoX3alj"
  patch_key "$f" USAGE_SIGNUP_WELCOME_TOKENS "10"
  patch_key "$f" FREE_MONTHLY_ALLOWANCE_MINUTES "5"
  patch_key "$f" SAMPLE_MODE_ENABLED "0"
  patch_key "$f" ANNUAL_BILLING_ENABLED "1"
  patch_key "$f" CANCEL_FLOW_ENABLED "1"
  patch_key "$f" FREE_MONTHLY_ALLOWANCE_ENABLED "1"
done

echo "Done. Restart backend: docker compose up -d backend"
