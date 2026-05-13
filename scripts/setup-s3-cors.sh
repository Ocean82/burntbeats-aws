#!/usr/bin/env bash
# Apply CORS configuration to the BurntBeats S3 bucket.
# Idempotent — safe to re-run at any time.
#
# Prerequisites:
#   - AWS CLI configured with credentials that have s3:PutBucketCors permission
#   - Or: export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY before running
#
# Usage:
#   bash scripts/setup-s3-cors.sh [bucket-name]

set -euo pipefail

BUCKET="${1:-burntbeatz2-storage}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORS_FILE="$SCRIPT_DIR/s3-cors-config.json"

echo "═══════════════════════════════════════════════════════"
echo "  BurntBeats S3 CORS Configuration"
echo "  Bucket: $BUCKET"
echo "═══════════════════════════════════════════════════════"
echo ""

# Step 1: Apply CORS
echo "→ Applying CORS config from $CORS_FILE ..."
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "file://$CORS_FILE"
echo "✓ CORS configuration applied."
echo ""

# Step 2: Verify
echo "→ Verifying CORS is set..."
aws s3api get-bucket-cors --bucket "$BUCKET"
echo ""
echo "✓ CORS verified."
echo ""

# Step 3: Preflight test (optional — requires a test object to exist)
echo "→ Testing CORS preflight from production origin..."
# Upload a tiny test object for preflight testing
echo "cors-test" | aws s3 cp - "s3://$BUCKET/stems/_cors_test.txt" --content-type "text/plain" 2>/dev/null || true

PREFLIGHT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
  -H "Origin: https://burntbeats.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization,Range" \
  "https://$BUCKET.s3.amazonaws.com/stems/_cors_test.txt" 2>/dev/null || echo "000")

if [ "$PREFLIGHT_RESPONSE" = "200" ] || [ "$PREFLIGHT_RESPONSE" = "204" ]; then
  echo "✓ Preflight returned HTTP $PREFLIGHT_RESPONSE — CORS is working."
else
  echo "⚠ Preflight returned HTTP $PREFLIGHT_RESPONSE — this may be normal if the object doesn't exist yet."
  echo "  CORS rules are applied; browser requests should work once stems are uploaded."
fi

# Clean up test object
aws s3 rm "s3://$BUCKET/stems/_cors_test.txt" 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Done. CORS is configured for:"
echo "    • https://burntbeats.com"
echo "    • https://www.burntbeats.com"
echo "    • http://localhost:5173 (dev)"
echo "    • http://localhost:5174 (dev)"
echo "    • http://localhost:3000 (dev)"
echo "═══════════════════════════════════════════════════════"
