Now I have everything needed. Let me produce the comprehensive remediation plan.

---

## Comprehensive Environment Remediation Plan

This plan addresses every issue discovered in the audit, organized into phases with verification steps. Each phase is independent and can be rolled back without affecting others.

---

### Phase 0: Pre-Flight Checks (Before Any Changes)

**Goal:** Establish a known-good baseline and confirm tooling is available.

**Steps:**

1. **Create a git branch for all changes**
   ```bash
   git checkout -b fix/env-audit-remediation
   ```

2. **Verify Stripe CLI is authenticated and can reach your account**
   ```bash
   stripe config --list
   stripe prices list --limit 5
   ```
   Expected: Returns your live prices (price_1T9s...). Confirms CLI is in live mode and authenticated.

3. **Verify Stripe webhook endpoint registration**
   ```bash
   stripe webhook_endpoints list
   ```
   Expected: Should show an endpoint pointing to `https://burntbeats.com/api/billing/webhook` or `https://www.burntbeats.com/api/billing/webhook`. Record the signing secret shown (or confirm it matches `whsec_nCaUM9ArPRjwqAa1lieItdDevmBasGTI`).

4. **Verify Stripe price IDs are valid and active**
   ```bash
   stripe prices retrieve price_1T9sQhP38C54URjE0Va7eUYl --format json
   stripe prices retrieve price_1T9sY3P38C54URjEQ9XHdBqm --format json
   stripe prices retrieve price_1T9sekP38C54URjEATva0Siw --format json
   stripe prices retrieve price_1T9sidP38C54URjEIcLojWrf --format json
   stripe prices retrieve price_1TQmdCP38C54URjE5VEClCWA --format json
   ```
   Expected: All return `"active": true`. If any returns an error, that price ID is invalid and must be corrected before proceeding.

5. **Verify AWS connectivity (optional but recommended)**
   ```bash
   aws sts get-caller-identity
   aws s3 ls s3://burntbeatz2-storage/stems/ --max-items 3
   ```
   Expected: Confirms IAM credentials are valid and bucket is accessible.

6. **Verify RDS connectivity from local machine**
   ```bash
   node backend/db-migrate.js 2>&1 | head -5
   ```
   Expected: Should connect successfully (or show "already up to date" type output).

7. **Snapshot current .env files** (local safety net)
   ```bash
   cp .env .env.backup-$(date +%Y%m%d)
   cp backend/.env backend/.env.backup-$(date +%Y%m%d)
   cp frontend/.env frontend/.env.backup-$(date +%Y%m%d)
   ```

---

### Phase 1: Fix Critical — `PUBLIC_BASE_URL` in Root `.env`

**Problem:** Root `.env` has `PUBLIC_BASE_URL=https://accounts.burntbeats.com/sign-in` which is a Clerk sign-in URL. In Docker production, this produces broken stem file URLs.

**File:** `.env`

**Change:**
```diff
- PUBLIC_BASE_URL=https://accounts.burntbeats.com/sign-in
+ PUBLIC_BASE_URL=https://burntbeats.com
```

**Verification:**
1. Grep to confirm no other file uses the wrong value:
   ```bash
   grep -r "accounts.burntbeats.com/sign-in" . --include="*.env" --include="*.yml"
   ```
   Expected: No matches after the fix.

2. Confirm the value matches what `backend/.env` uses:
   ```bash
   grep "PUBLIC_BASE_URL" backend/.env
   ```
   Expected: `PUBLIC_BASE_URL=https://burntbeats.com` — matches.

3. Confirm docker-compose.yml passes it correctly:
   ```bash
   grep "PUBLIC_BASE_URL" docker-compose.yml
   ```
   Expected: `PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:-}` — will resolve to `https://burntbeats.com`.

---

### Phase 2: Fix Critical — Add `STRIPE_PRICE_ID_SINGLE` to Docker Compose

**Problem:** The backend code reads `process.env.STRIPE_PRICE_ID_SINGLE` for the Single Song Pack checkout, but `docker-compose.yml` never injects it into the container. Checkout for "single" plan fails in production Docker.

**File:** `docker-compose.yml`

**Change:** Add after the `STRIPE_PRICE_ID_TOPUP` line in the backend environment section:
```diff
       STRIPE_PRICE_ID_TOPUP: ${STRIPE_PRICE_ID_TOPUP:-}
+      STRIPE_PRICE_ID_SINGLE: ${STRIPE_PRICE_ID_SINGLE:-}
       S3_REGION: ${S3_REGION:-us-east-1}
```

**Verification:**
1. Validate compose file syntax:
   ```bash
   docker compose config --quiet
   ```
   Expected: No errors.

2. Dry-run variable interpolation:
   ```bash
   docker compose config | grep STRIPE_PRICE_ID_SINGLE
   ```
   Expected: Shows `STRIPE_PRICE_ID_SINGLE: price_1TQmdCP38C54URjE5VEClCWA` (resolved from root `.env`).

3. Cross-check the price ID is valid:
   ```bash
   stripe prices retrieve price_1TQmdCP38C54URjE5VEClCWA
   ```
   Expected: Returns active price object.

---

### Phase 3: Fix Critical — Sync `VITE_STRIPE_PRICING_TABLE_ID`

**Problem:** Root `.env` (Docker build) uses `prctbl_1TDi3xP38C54URjEgYUuBSQW` while `frontend/.env` (local dev) uses `prctbl_1TQnDbP38C54URjEHiFxYRIh`. Production Docker build gets the stale table.

**Investigation step:** Determine which is the current pricing table.
```bash
# Check Stripe Dashboard or use the API (pricing tables aren't in the standard CLI,
# but you can check which one is live by visiting:
# https://dashboard.stripe.com/pricing-tables
```

**File:** `.env` (root)

**Change** (assuming `prctbl_1TQnDbP38C54URjEHiFxYRIh` is the current one — confirm first):
```diff
- VITE_STRIPE_PRICING_TABLE_ID=prctbl_1TDi3xP38C54URjEgYUuBSQW
+ VITE_STRIPE_PRICING_TABLE_ID=prctbl_1TQnDbP38C54URjEHiFxYRIh
```

**Verification:**
1. Confirm both files now match:
   ```bash
   grep "VITE_STRIPE_PRICING_TABLE_ID" .env frontend/.env
   ```
   Expected: Same value in both.

2. Rebuild frontend image and verify the value is baked in:
   ```bash
   docker compose build frontend 2>&1 | tail -5
   docker compose run --rm frontend sh -c "grep -o 'prctbl_[A-Za-z0-9]*' /usr/share/nginx/html/assets/*.js | head -3"
   ```
   Expected: Shows the correct pricing table ID in the built JS bundle.

---

### Phase 4: Add Missing Frontend Build Args to Docker Pipeline

**Problem:** `VITE_STRIPE_PACKAGE_PRICING_TABLE_ID` and `VITE_FULL_PRICING_URL` are defined in `frontend/.env` but not passed through the Docker build pipeline. These features won't work in production.

#### 4a. Update `frontend/Dockerfile`

**File:** `frontend/Dockerfile`

**Change:** Add after the `VITE_GA_MEASUREMENT_ID` ARG/ENV block:
```diff
 ARG VITE_GA_MEASUREMENT_ID
 ENV VITE_GA_MEASUREMENT_ID=${VITE_GA_MEASUREMENT_ID}
+ARG VITE_FULL_PRICING_URL
+ENV VITE_FULL_PRICING_URL=${VITE_FULL_PRICING_URL}
+ARG VITE_STRIPE_PACKAGE_PRICING_TABLE_ID
+ENV VITE_STRIPE_PACKAGE_PRICING_TABLE_ID=${VITE_STRIPE_PACKAGE_PRICING_TABLE_ID}
```

#### 4b. Update `docker-compose.yml` frontend build args

**File:** `docker-compose.yml`

**Change:** Add after `VITE_GA_MEASUREMENT_ID` in the frontend build args:
```diff
         VITE_GA_MEASUREMENT_ID: ${VITE_GA_MEASUREMENT_ID:-}
+        VITE_FULL_PRICING_URL: ${VITE_FULL_PRICING_URL:-}
+        VITE_STRIPE_PACKAGE_PRICING_TABLE_ID: ${VITE_STRIPE_PACKAGE_PRICING_TABLE_ID:-}
```

#### 4c. Add values to root `.env`

**File:** `.env`

**Change:** Add in the Frontend section:
```diff
 VITE_GA_MEASUREMENT_ID=G-FZFE8WBX6H
+VITE_FULL_PRICING_URL=https://www.burntbeats.com/pricing
+VITE_STRIPE_PACKAGE_PRICING_TABLE_ID=prctbl_1TQnbwP38C54URjEfz5v1Hlw
```

#### 4d. Update `.env.example` (root)

**File:** `.env.example`

**Change:** Add after the `VITE_STRIPE_PUBLISHABLE_KEY` section:
```diff
 VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key_here
+
+# Stripe pricing table ID (Dashboard → Product catalog → Pricing tables)
+# VITE_STRIPE_PRICING_TABLE_ID=prctbl_xxxxxxxxxxxxxxxxxxxxxxxx
+
+# Stripe package pricing table ID (for single-song / top-up packages)
+# VITE_STRIPE_PACKAGE_PRICING_TABLE_ID=prctbl_xxxxxxxxxxxxxxxxxxxxxxxx
+
+# Full external pricing page URL (opened from in-app header button)
+# VITE_FULL_PRICING_URL=https://www.burntbeats.com/pricing
```

**Verification:**
1. Validate compose config:
   ```bash
   docker compose config | grep -A2 "VITE_FULL_PRICING_URL\|VITE_STRIPE_PACKAGE"
   ```
   Expected: Both vars appear in frontend build args with correct values.

2. Validate Dockerfile syntax:
   ```bash
   docker compose build frontend --no-cache 2>&1 | grep -i error
   ```
   Expected: No errors.

---

### Phase 5: Add Missing `S3_BUCKET` and `S3_PREFIX` to Backend Container

**Problem:** The backend's `s3Presign.js` reads `S3_BUCKET` implicitly via the routes that call it, but `docker-compose.yml` only passes `S3_BUCKET` to `stem_service`, not to `backend`. The backend receives `S3_REGION` but not `S3_BUCKET` or `S3_PREFIX`.

**Investigation:** Check how the backend actually gets the bucket name:

```bash
grep -n "S3_BUCKET\|S3_PREFIX" backend/routes/stems/*.js backend/s3Presign.js
```

**File:** `docker-compose.yml`

**Change:** Add to backend environment section (after `S3_PRESIGN_EXPIRES_SECONDS`):
```diff
       S3_PRESIGN_EXPIRES_SECONDS: ${S3_PRESIGN_EXPIRES_SECONDS:-3600}
+      S3_BUCKET: ${S3_BUCKET:-}
+      S3_PREFIX: ${S3_PREFIX:-stems}
```

**Verification:**
```bash
docker compose config | grep -A1 "S3_BUCKET"
```
Expected: Shows `S3_BUCKET: burntbeatz2-storage` for backend service.

---

### Phase 6: Remove Windows-Only Paths from Root `.env`

**Problem:** `NODE_EXTRA_CA_CERTS=d:/burntbeats-aws/backend/global-bundle.pem` and `PGSSLROOTCERT=d:/burntbeats-aws/backend/global-bundle.pem` are Windows-local paths. They don't affect Docker (not passed to container) but are confusing and would break if someone added them to docker-compose.yml.

**File:** `.env`

**Change:** Remove or comment out:
```diff
 DATABASE_URL=postgresql://burntbeatsadmin:BurntBeats2025SecurePass!@burntbeats-db.cgnemc2qmel7.us-east-1.rds.amazonaws.com:5432/burntbeats?uselibpqcompat=true&sslmode=require
-NODE_EXTRA_CA_CERTS=d:/burntbeats-aws/backend/global-bundle.pem
-PGSSLROOTCERT=d:/burntbeats-aws/backend/global-bundle.pem
+# NODE_EXTRA_CA_CERTS and PGSSLROOTCERT are local-dev-only (Windows paths).
+# Keep them in backend/.env for local psql/node usage. Not needed for Docker
+# (backend uses ssl: { rejectUnauthorized: false } which is sslmode=require without CA verify).
```

**Note:** These remain in `backend/.env` where they're actually used for local development.

**Verification:**
```bash
grep "NODE_EXTRA_CA_CERTS\|PGSSLROOTCERT" .env
```
Expected: Only comments, no active values.

---

### Phase 7: Clean Unused Variables from `backend/.env`

**Problem:** Several variables are defined but never read by any code, adding confusion and potential security exposure.

**File:** `backend/.env`

**Changes:** Comment out or remove these lines (add a note explaining why):
```diff
-STRIPE_WEBHOOK_ENDPOINT=https://www.burntbeats.com/api/billing/webhook
-STRIPE_DESTINATION_ID=we_1RdvZoP38C54URjErn742jlk
+# STRIPE_WEBHOOK_ENDPOINT — informational only (not read by code; see Stripe Dashboard)
+# STRIPE_DESTINATION_ID — not read by code (Stripe Connect payout reference only)

-EC2_INSTANCE_ID=i-0aedf69f3127e24f8
-EC2_SERVER_IP=52.0.207.242
+# EC2_INSTANCE_ID / EC2_SERVER_IP — ops metadata only (not read by code)
+# EC2_INSTANCE_ID=i-0aedf69f3127e24f8
+# EC2_SERVER_IP=52.0.207.242
```

Also comment out Clerk vars not read by code:
```diff
-CLERK_FRONTEND_API_URL=https://clerk.burntbeats.com
-CLERK_BACKEND_API_URL=https://api.clerk.com
-CLERK_NEWUSER_ENDPOINT=ep_3CT47VzShEFDGW5gSYoPzubIBjg
-CLERK_NEWUSER_URL=https://www.burntbeats.com/newuser
+# ── Clerk ops metadata (not read by backend code — Dashboard reference only) ──
+# CLERK_FRONTEND_API_URL=https://clerk.burntbeats.com
+# CLERK_BACKEND_API_URL=https://api.clerk.com
+# CLERK_NEWUSER_ENDPOINT=ep_3CT47VzShEFDGW5gSYoPzubIBjg
+# CLERK_NEWUSER_URL=https://www.burntbeats.com/newuser
```

**Verification:**
1. Backend still starts cleanly:
   ```bash
   cd backend && node --env-file=.env -e "console.log('OK: PORT=' + process.env.PORT)"
   ```
   Expected: `OK: PORT=3001`

2. No code references the removed vars:
   ```bash
   grep -rn "STRIPE_DESTINATION_ID\|STRIPE_WEBHOOK_ENDPOINT\|EC2_INSTANCE_ID\|EC2_SERVER_IP\|CLERK_NEWUSER_ENDPOINT\|CLERK_NEWUSER_URL\|CLERK_BACKEND_API_URL" backend/ --include="*.js" --include="*.mjs"
   ```
   Expected: No matches.

---

### Phase 8: Remove `STRIPE_ACCOUNT_ID` Noise from Root `.env`

**Problem:** `STRIPE_ACCOUNT_ID=` is empty and not used by any code.

**File:** `.env`

**Change:**
```diff
-STRIPE_ACCOUNT_ID=
+# STRIPE_ACCOUNT_ID is not read by backend code (Dashboard reference only).
+# If needed later, get from: https://dashboard.stripe.com → Settings → Account details
```

**File:** `.env.example` — keep it documented (already there) but mark as optional/unused:
```diff
-# Stripe account ID — from https://dashboard.stripe.com → Settings → Account details
-STRIPE_ACCOUNT_ID=acct_xxxxxxxxxxxx
+# Stripe account ID — not currently read by backend code (Dashboard reference only).
+# STRIPE_ACCOUNT_ID=acct_xxxxxxxxxxxx
```

---

### Phase 9: Add Backend Startup Validation for `STRIPE_PRICE_ID_SINGLE`

**Problem:** If `STRIPE_PRICE_ID_SINGLE` is empty, the "single" plan checkout silently fails with a generic "Unknown plan" error. A startup warning would catch misconfiguration early.

**File:** `backend/billing/stripeClient.js`

**Change:** Add a startup warning after the `getPriceIds` function:
```javascript
// Startup validation — warn if any expected price ID is missing
if (process.env.NODE_ENV !== "test") {
  const _ids = getPriceIds();
  const missing = Object.entries(_ids)
    .filter(([, v]) => !v)
    .map(([k]) => `STRIPE_PRICE_ID_${k.toUpperCase()}`);
  if (missing.length > 0) {
    console.warn(`[billing] Missing price IDs (checkout will fail for these plans): ${missing.join(", ")}`);
  }
}
```

**Verification:**
```bash
cd backend && STRIPE_PRICE_ID_SINGLE= node --env-file=.env -e "import('./billing/stripeClient.js')" 2>&1 | grep "Missing price"
```
Expected: Warning about STRIPE_PRICE_ID_SINGLE.

---

### Phase 10: Harden Deploy Script — Don't Overwrite Server `.env`

**Problem:** `deploy-to-ec2.sh` includes `.env` files in the tarball. If local `.env` values differ from production (e.g., `DEV_BYPASS_UPLOAD_AUTH=1`), deploying overwrites production secrets with dev values.

**File:** `deploy-to-ec2.sh`

**Change:** Add `.env` exclusions to the tar command:
```diff
 tar czf /tmp/burntbeats-deploy.tar.gz \
   --exclude='./node_modules' \
   --exclude='./.venv' \
   --exclude='./.git' \
   --exclude='./.pytest_cache' \
   --exclude='./.ruff_cache' \
   --exclude='./frontend/dist' \
   --exclude='./tmp*' \
   --exclude='./stem_test*' \
   --exclude='./logs' \
   --exclude='./.cursor' \
   --exclude='./.idea' \
   --exclude='./models' \
   --exclude='./benchmark_out*' \
   --exclude='./*.tgz' \
+  --exclude='./.env' \
+  --exclude='./backend/.env' \
+  --exclude='./frontend/.env' \
   .
```

**Add a post-extract step** that warns if `.env` is missing on the server:
```diff
 ssh -i "$SSH_KEY" "$SERVER" << ENDSSH
 set -e

 # Extract archive
 echo "Extracting..."
 mkdir -p $REMOTE_DIR
 tar xzf /tmp/burntbeats-deploy.tar.gz -C $REMOTE_DIR
 rm /tmp/burntbeats-deploy.tar.gz
 echo "✅ Extracted to $REMOTE_DIR"

+# Verify .env exists on server (must be managed separately)
+if [ ! -f "$REMOTE_DIR/.env" ]; then
+  echo "⚠️  WARNING: $REMOTE_DIR/.env not found! Docker Compose will fail."
+  echo "   Copy production .env to the server before running docker compose."
+  exit 1
+fi
+
 # Stop old PM2 ghost processes
```

**Verification:**
1. Create a test tarball and confirm .env is excluded:
   ```bash
   tar czf /tmp/test-deploy.tar.gz --exclude='./.env' --exclude='./backend/.env' --exclude='./frontend/.env' --exclude='./node_modules' --exclude='./.git' --exclude='./.venv' . 2>/dev/null
   tar tzf /tmp/test-deploy.tar.gz | grep "\.env$"
   ```
   Expected: No `.env` files listed (only `.env.example` files).

2. Clean up:
   ```bash
   rm /tmp/test-deploy.tar.gz
   ```

---

### Phase 11: Sync `USAGE_SIGNUP_WELCOME_TOKENS` (Intentionality Check)

**Current state:**
- Root `.env` (Docker production): `USAGE_SIGNUP_WELCOME_TOKENS=5`
- `backend/.env` (local dev): `USAGE_SIGNUP_WELCOME_TOKENS=1`

**Decision required:** Is this intentional? Production gives 5 free minutes on signup; local dev gives 1.

**If production should be 5 (likely correct):** No change needed. Document the intentional difference.

**File:** `backend/.env` — add a comment:
```diff
-USAGE_SIGNUP_WELCOME_TOKENS=1
+# Welcome tokens for new signups. Production uses 5 (set in root .env for Docker).
+# Local dev uses 1 to conserve test balance during development.
+USAGE_SIGNUP_WELCOME_TOKENS=1
```

---

### Phase 12: Update `ENVIRONMENT-MATRIX.md` Documentation

**File:** `docs/ENVIRONMENT-MATRIX.md`

**Changes:**
1. Add `STRIPE_PRICE_ID_SINGLE` to the backend table
2. Add `VITE_FULL_PRICING_URL` and `VITE_STRIPE_PACKAGE_PRICING_TABLE_ID` to the frontend table (already partially there)
3. Add `S3_BUCKET` and `S3_PREFIX` to the backend table
4. Add a note about `SAMPLE_MODE_ENABLED` (dev-only, not passed to Docker intentionally)

Add to the "Cross-checks before release" table:
```markdown
| Pricing table IDs | `VITE_STRIPE_PRICING_TABLE_ID` in root `.env` = `frontend/.env`. |
| Single price ID | `STRIPE_PRICE_ID_SINGLE` present in root `.env` and docker-compose.yml. |
| PUBLIC_BASE_URL | Must be `https://burntbeats.com` (not a Clerk URL). |
```

---

### Phase 13: Final Validation (End-to-End)

After all changes are applied:

1. **Compose config validation:**
   ```bash
   docker compose config --quiet
   ```
   Expected: Exit 0, no errors.

2. **Full variable interpolation check:**
   ```bash
   docker compose config | grep -E "STRIPE_PRICE_ID_SINGLE|PUBLIC_BASE_URL|S3_BUCKET|VITE_FULL_PRICING|VITE_STRIPE_PACKAGE"
   ```
   Expected: All vars present with correct values.

3. **Backend local start test:**
   ```bash
   cd backend && timeout 5 node --env-file=.env server.js 2>&1 | head -20
   ```
   Expected: Server starts, no missing-env errors, shows `[startup]` warnings only for intentionally-unset vars.

4. **Stripe webhook verification:**
   ```bash
   stripe trigger checkout.session.completed
   ```
   Expected: If running `stripe listen` locally, the webhook is received and processed. In production, verify via Stripe Dashboard → Webhooks → Recent deliveries.

5. **Clerk webhook verification:**
   - Go to Clerk Dashboard → Webhooks → your endpoint
   - Confirm endpoint URL is `https://www.burntbeats.com/api/clerk/webhook`
   - Confirm signing secret matches `CLERK_WEBHOOK_SIGNING_SECRET` in root `.env`
   - Send a test event from the Dashboard

6. **Database connectivity from Docker:**
   ```bash
   docker compose run --rm backend node -e "
     import('./db.js').then(m => {
       const p = m.getPool();
       if (p) p.query('SELECT 1').then(() => { console.log('DB OK'); process.exit(0); });
       else { console.log('DB not configured'); process.exit(1); }
     })
   "
   ```
   Expected: `DB OK`

7. **Git diff review:**
   ```bash
   git diff --stat
   ```
   Review all changes, confirm no secrets were accidentally added to tracked files.

8. **Commit:**
   ```bash
   git add .env.example docker-compose.yml frontend/Dockerfile deploy-to-ec2.sh docs/ENVIRONMENT-MATRIX.md backend/billing/stripeClient.js
   git commit -m "fix: env audit — sync pricing IDs, fix PUBLIC_BASE_URL, harden deploy

   - Fix PUBLIC_BASE_URL (was Clerk sign-in URL, now site origin)
   - Add STRIPE_PRICE_ID_SINGLE to docker-compose.yml
   - Sync VITE_STRIPE_PRICING_TABLE_ID between root and frontend
   - Add VITE_FULL_PRICING_URL + VITE_STRIPE_PACKAGE_PRICING_TABLE_ID to Docker pipeline
   - Add S3_BUCKET/S3_PREFIX to backend container env
   - Remove Windows-only paths from root .env
   - Clean unused vars from backend/.env
   - Add startup warning for missing price IDs
   - Exclude .env from deploy tarball (manage server secrets separately)
   - Update ENVIRONMENT-MATRIX.md"
   ```

---

### Summary of Files Modified

| File | Changes |
|------|---------|
| `.env` | Fix PUBLIC_BASE_URL, sync pricing table ID, add VITE_FULL_PRICING_URL + VITE_STRIPE_PACKAGE_PRICING_TABLE_ID, remove NODE_EXTRA_CA_CERTS/PGSSLROOTCERT, remove empty STRIPE_ACCOUNT_ID |
| `.env.example` | Add new VITE_* vars, mark STRIPE_ACCOUNT_ID as unused |
| `docker-compose.yml` | Add STRIPE_PRICE_ID_SINGLE, S3_BUCKET, S3_PREFIX, VITE_FULL_PRICING_URL, VITE_STRIPE_PACKAGE_PRICING_TABLE_ID to appropriate services |
| `frontend/Dockerfile` | Add ARG/ENV for VITE_FULL_PRICING_URL + VITE_STRIPE_PACKAGE_PRICING_TABLE_ID |
| `backend/.env` | Comment out unused vars (STRIPE_DESTINATION_ID, EC2_*, CLERK_NEWUSER_*, etc.) |
| `backend/billing/stripeClient.js` | Add startup warning for missing price IDs |
| `deploy-to-ec2.sh` | Exclude .env files from tarball, add server .env existence check |
| `docs/ENVIRONMENT-MATRIX.md` | Add missing vars, add cross-check rules |

---

### Risk Assessment

| Change | Risk | Reversibility |
|--------|------|---------------|
| Fix PUBLIC_BASE_URL | Low — fixes broken stem URLs | Instant (revert line) |
| Add STRIPE_PRICE_ID_SINGLE to compose | Low — enables existing feature | Instant |
| Sync pricing table ID | Medium — verify correct ID first | Instant |
| Add VITE_* to Docker pipeline | Low — additive only | Instant |
| Exclude .env from deploy | Medium — requires server .env to already exist | Revert script |
| Clean unused vars | Low — confirmed not read by code | Restore from backup |
