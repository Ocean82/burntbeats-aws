#!/usr/bin/env bash
# Verify AWS S3 credentials and bucket access for BurntBeats stem storage.
#
# Prerequisites:
#   - AWS CLI installed and configured (or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY exported)
#   - Docker Compose available (for config verification)
#
# Usage:
#   bash scripts/verify-s3-credentials.sh [bucket-name]
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed

set -euo pipefail

BUCKET="${1:-burntbeatz2-storage}"
PREFIX="stems"
TEST_KEY="${PREFIX}/_verify_credential_test_$(date +%s).txt"
PASSED=0
FAILED=0

green() { printf "\033[32m✓ %s\033[0m\n" "$1"; }
red()   { printf "\033[31m✗ %s\033[0m\n" "$1"; }
info()  { printf "\033[36m→ %s\033[0m\n" "$1"; }

check() {
  if eval "$2" > /dev/null 2>&1; then
    green "$1"
    PASSED=$((PASSED + 1))
  else
    red "$1"
    FAILED=$((FAILED + 1))
  fi
}

echo ""
info "BurntBeats S3 Credential Verification"
info "Bucket: $BUCKET | Region: us-east-1"
echo "────────────────────────────────────────────────────────"

# 1. Verify AWS identity
echo ""
info "Step 1: AWS Identity"
if aws sts get-caller-identity > /dev/null 2>&1; then
  IDENTITY=$(aws sts get-caller-identity --query 'Arn' --output text 2>/dev/null || echo "unknown")
  green "AWS identity verified: $IDENTITY"
  PASSED=$((PASSED + 1))
else
  red "AWS identity check failed — credentials not configured or expired"
  FAILED=$((FAILED + 1))
fi

# 2. Verify bucket exists and is accessible
echo ""
info "Step 2: Bucket Access"
check "HeadBucket (bucket exists and is accessible)" "aws s3api head-bucket --bucket $BUCKET"

# 3. Verify PutObject permission
echo ""
info "Step 3: PutObject Permission"
if echo "credential-test" | aws s3 cp - "s3://$BUCKET/$TEST_KEY" > /dev/null 2>&1; then
  green "PutObject succeeded (s3://$BUCKET/$TEST_KEY)"
  PASSED=$((PASSED + 1))
else
  red "PutObject failed — IAM policy may be missing s3:PutObject"
  FAILED=$((FAILED + 1))
fi

# 4. Verify GetObject permission
info "Step 4: GetObject Permission"
if aws s3 cp "s3://$BUCKET/$TEST_KEY" - > /dev/null 2>&1; then
  green "GetObject succeeded"
  PASSED=$((PASSED + 1))
else
  red "GetObject failed — IAM policy may be missing s3:GetObject"
  FAILED=$((FAILED + 1))
fi

# 5. Verify ListBucket permission
info "Step 5: ListBucket Permission"
check "ListBucket (list objects under prefix)" "aws s3 ls s3://$BUCKET/$PREFIX/ --max-items 1"

# 6. Clean up test object
aws s3 rm "s3://$BUCKET/$TEST_KEY" > /dev/null 2>&1 || true

# 7. Verify docker-compose interpolation (if docker compose is available)
echo ""
info "Step 6: Docker Compose Config"
if command -v docker > /dev/null 2>&1; then
  if docker compose config 2>/dev/null | grep -q "S3_BUCKET"; then
    green "docker compose config contains S3_BUCKET"
    PASSED=$((PASSED + 1))
  else
    red "docker compose config missing S3_BUCKET — check .env and docker-compose.yml"
    FAILED=$((FAILED + 1))
  fi
  if docker compose config 2>/dev/null | grep -q "S3_ENABLED"; then
    green "docker compose config contains S3_ENABLED"
    PASSED=$((PASSED + 1))
  else
    red "docker compose config missing S3_ENABLED"
    FAILED=$((FAILED + 1))
  fi
else
  info "Docker not available — skipping compose config check"
fi

# Summary
echo ""
echo "────────────────────────────────────────────────────────"
if [ "$FAILED" -eq 0 ]; then
  green "All $PASSED checks passed. S3 credentials are valid."
  exit 0
else
  red "$FAILED check(s) failed, $PASSED passed."
  echo ""
  echo "Troubleshooting:"
  echo "  • Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set"
  echo "  • Check IAM policy includes s3:PutObject, s3:GetObject, s3:ListBucket"
  echo "  • Ensure bucket '$BUCKET' exists in us-east-1"
  exit 1
fi
