#!/usr/bin/env bash
# Validates backend/.env and frontend/.env for production readiness.
# Run from repo root: bash scripts/check_env.sh
# Exit code 0 = all required vars present. Non-zero = missing/invalid vars found.

set -euo pipefail
cd "$(dirname "$0")/.." || exit 1

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
ERRORS=0; WARNINGS=0

pass()  { echo -e "  ${GREEN}✔${NC}  $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC}  $1"; ((WARNINGS++)) || true; }
fail()  { echo -e "  ${RED}✘${NC}  $1"; ((ERRORS++)) || true; }
header(){ echo -e "\n${CYAN}── $1 ──${NC}"; }

# Load an env file into associative array
declare -A BENV FENV

load_env() {
  local file="$1"
  local -n ref="$2"
  if [[ ! -f "$file" ]]; then return 1; fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      val="${BASH_REMATCH[2]}"
      val="${val%$'\r'}"
      ref["${BASH_REMATCH[1]}"]="$val"
    fi
  done < "$file"
}

load_env "backend/.env"  BENV || true
load_env "frontend/.env" FENV || true

# ── File presence ─────────────────────────────────────────────────────────────
header "Env files"
[[ -f "backend/.env"  ]] && pass "backend/.env exists"  || fail "backend/.env missing — copy backend/.env.example and fill in values"
[[ -f "frontend/.env" ]] && pass "frontend/.env exists" || fail "frontend/.env missing — copy frontend/.env.example and fill in values"

# ── Git safety ────────────────────────────────────────────────────────────────
header "Git safety"
for f in "backend/.env" "frontend/.env" ".env"; do
  if git -C . check-ignore -q "$f" 2>/dev/null; then
    pass "$f is gitignored"
  else
    fail "$f is NOT gitignored — add it to .gitignore immediately"
  fi
done

# Check no real secrets are in committed files
for f in ".env.example" "backend/.env.example" "frontend/.env.example"; do
  if [[ -f "$f" ]]; then
    # Extract actual values (not placeholders). Real keys have varied chars, not just x's.
    real_stripe=$(grep -E '^\s*STRIPE_SECRET_KEY\s*=\s*sk_(live|test)_' "$f" 2>/dev/null \
      | grep -vE '=\s*sk_(live|test)_x+\s*$' || true)
    real_clerk=$(grep -E '^\s*CLERK_SECRET_KEY\s*=\s*sk_(live|test)_' "$f" 2>/dev/null \
      | grep -vE '=\s*sk_(live|test)_x+\s*$' || true)
    real_webhook=$(grep -E '^\s*STRIPE_WEBHOOK_SECRET\s*=\s*whsec_' "$f" 2>/dev/null \
      | grep -vE '=\s*whsec_x+\s*$' || true)
    if [[ -n "$real_stripe" || -n "$real_clerk" ]]; then
      fail "$f contains a real secret key — replace with placeholder"
    elif [[ -n "$real_webhook" ]]; then
      fail "$f contains a real webhook secret — replace with placeholder"
    else
      pass "$f has no real secrets"
    fi
  fi
done

# ── Backend required vars ─────────────────────────────────────────────────────
header "Backend required vars (backend/.env)"

check_b() {
  local key="$1" pattern="${2:-}" label="${3:-$1}"
  local val="${BENV[$key]:-}"
  if [[ -z "$val" ]]; then
    fail "$label is not set"
  elif [[ -n "$pattern" ]] && ! echo "$val" | grep -qE "$pattern"; then
    fail "$label looks wrong (value doesn't match expected format)"
  else
    pass "$label is set"
  fi
}

check_b "CLERK_SECRET_KEY"      '^sk_(live|test)_[A-Za-z0-9+/=]{10,}' "CLERK_SECRET_KEY"
check_b "STRIPE_SECRET_KEY"     '^sk_(live|test)_[A-Za-z0-9]{20,}'     "STRIPE_SECRET_KEY"
check_b "STRIPE_WEBHOOK_SECRET" '^whsec_[A-Za-z0-9]{10,}'              "STRIPE_WEBHOOK_SECRET"
check_b "STRIPE_PRICE_ID_BASIC"   '^price_[A-Za-z0-9]{10,}' "STRIPE_PRICE_ID_BASIC"
check_b "STRIPE_PRICE_ID_PREMIUM" '^price_[A-Za-z0-9]{10,}' "STRIPE_PRICE_ID_PREMIUM"
check_b "STRIPE_PRICE_ID_STUDIO"  '^price_[A-Za-z0-9]{10,}' "STRIPE_PRICE_ID_STUDIO"
check_b "STRIPE_PRICE_ID_TOPUP"   '^price_[A-Za-z0-9]{10,}' "STRIPE_PRICE_ID_TOPUP"
check_b "JOB_TOKEN_SECRET"      '^[A-Za-z0-9+/=_-]{16,}'               "JOB_TOKEN_SECRET"

# ── Backend optional but recommended ─────────────────────────────────────────
header "Backend optional vars"

[[ -n "${BENV[FRONTEND_ORIGINS]:-}" ]] && pass "FRONTEND_ORIGINS is set" \
  || warn "FRONTEND_ORIGINS not set — defaults to localhost only (fine for dev)"

[[ -n "${BENV[PORT]:-}" ]] && pass "PORT is set (${BENV[PORT]})" \
  || warn "PORT not set — defaults to 3001"

[[ -n "${BENV[STEM_SERVICE_URL]:-}" ]] && pass "STEM_SERVICE_URL is set (${BENV[STEM_SERVICE_URL]})" \
  || warn "STEM_SERVICE_URL not set — defaults to http://localhost:5000"

# Metering safety defaults
if [[ "${BENV[USAGE_TOKENS_ENABLED]:-}" =~ ^(1|true|yes)$ ]]; then
  pass "USAGE_TOKENS_ENABLED is ON"
else
  warn "USAGE_TOKENS_ENABLED is OFF — this can allow unmetered use"
fi

if [[ "${BENV[ALLOW_UNMETERED_PROD]:-}" =~ ^(1|true|yes)$ ]]; then
  warn "ALLOW_UNMETERED_PROD is ON — production startup guard is bypassed"
else
  pass "ALLOW_UNMETERED_PROD is OFF"
fi

if [[ "${BENV[DEV_BYPASS_UPLOAD_AUTH]:-}" =~ ^(1|true|yes)$ ]]; then
  fail "DEV_BYPASS_UPLOAD_AUTH is ON — disable for production"
else
  pass "DEV_BYPASS_UPLOAD_AUTH is OFF"
fi

# Warn if FRONTEND_ORIGINS still has localhost in production
if [[ -n "${BENV[FRONTEND_ORIGINS]:-}" ]]; then
  if echo "${BENV[FRONTEND_ORIGINS]}" | grep -q "localhost" && \
     echo "${BENV[FRONTEND_ORIGINS]}" | grep -q "https://"; then
    warn "FRONTEND_ORIGINS includes both localhost and a production domain — fine for dev, remove localhost for prod"
  fi
fi

# Warn if using test keys
if echo "${BENV[STRIPE_SECRET_KEY]:-}" | grep -q "sk_test_"; then
  warn "STRIPE_SECRET_KEY is a TEST key — switch to live key for production"
fi
if echo "${BENV[CLERK_SECRET_KEY]:-}" | grep -q "sk_test_"; then
  warn "CLERK_SECRET_KEY is a TEST key — switch to live key for production"
fi

# ── Frontend required vars ────────────────────────────────────────────────────
header "Frontend required vars (frontend/.env)"

check_f() {
  local key="$1" pattern="${2:-}" label="${3:-$1}"
  local val="${FENV[$key]:-}"
  if [[ -z "$val" ]]; then
    fail "$label is not set"
  elif [[ -n "$pattern" ]] && ! echo "$val" | grep -qE "$pattern"; then
    fail "$label looks wrong (value doesn't match expected format)"
  else
    pass "$label is set"
  fi
}

check_f "VITE_CLERK_PUBLISHABLE_KEY"  '^pk_(live|test)_[A-Za-z0-9+/=]{10,}' "VITE_CLERK_PUBLISHABLE_KEY"
check_f "VITE_STRIPE_PUBLISHABLE_KEY" '^pk_(live|test)_[A-Za-z0-9]{20,}'     "VITE_STRIPE_PUBLISHABLE_KEY"

# Empty = same-origin API (Docker Compose + nginx /api proxy, or static host serving SPA + API on one origin).
vite_api="${FENV[VITE_API_BASE_URL]:-}"
if [[ -z "$vite_api" ]]; then
  pass "VITE_API_BASE_URL is empty — same-origin /api (typical Docker + reverse proxy)"
elif echo "$vite_api" | grep -qE '^https?://'; then
  pass "VITE_API_BASE_URL is set"
else
  fail "VITE_API_BASE_URL must be empty (same-origin) or an http(s) URL"
fi

# Warn if frontend still points to localhost in production
if echo "${FENV[VITE_API_BASE_URL]:-}" | grep -q "localhost"; then
  warn "VITE_API_BASE_URL points to localhost — update to your production backend URL before deploying"
fi

if echo "${FENV[VITE_STRIPE_PUBLISHABLE_KEY]:-}" | grep -q "pk_test_"; then
  warn "VITE_STRIPE_PUBLISHABLE_KEY is a TEST key — switch to live key for production"
fi
if echo "${FENV[VITE_CLERK_PUBLISHABLE_KEY]:-}" | grep -q "pk_test_"; then
  warn "VITE_CLERK_PUBLISHABLE_KEY is a TEST key — switch to live key for production"
fi

# ── Key pairing sanity ────────────────────────────────────────────────────────
header "Key environment consistency"

b_stripe="${BENV[STRIPE_SECRET_KEY]:-}"
f_stripe="${FENV[VITE_STRIPE_PUBLISHABLE_KEY]:-}"
b_clerk="${BENV[CLERK_SECRET_KEY]:-}"
f_clerk="${FENV[VITE_CLERK_PUBLISHABLE_KEY]:-}"

# Both Stripe keys should be same environment (live/test)
if [[ -n "$b_stripe" && -n "$f_stripe" ]]; then
  b_env=$(echo "$b_stripe" | grep -oE 'sk_(live|test)' | cut -d_ -f2)
  f_env=$(echo "$f_stripe" | grep -oE 'pk_(live|test)' | cut -d_ -f2)
  if [[ "$b_env" == "$f_env" ]]; then
    pass "Stripe keys are both $b_env mode"
  else
    fail "Stripe key mismatch: backend is $b_env but frontend is $f_env — they must match"
  fi
fi

# Both Clerk keys should be same environment
if [[ -n "$b_clerk" && -n "$f_clerk" ]]; then
  b_env=$(echo "$b_clerk" | grep -oE 'sk_(live|test)' | cut -d_ -f2)
  f_env=$(echo "$f_clerk" | grep -oE 'pk_(live|test)' | cut -d_ -f2)
  if [[ "$b_env" == "$f_env" ]]; then
    pass "Clerk keys are both $b_env mode"
  else
    fail "Clerk key mismatch: backend is $b_env but frontend is $f_env — they must match"
  fi
fi

# ── Python / ML stack (optional, skip if no venv) ────────────────────────────
header "Python / ML stack"
if [[ -f ".venv/bin/activate" ]]; then
  source .venv/bin/activate
  timeout 10 python3 -c "
import sys
checks = [('torch', None), ('torchaudio', None), ('demucs', None)]
for mod, _ in checks:
    try:
        m = __import__(mod)
        ver = getattr(m, '__version__', '?')
        print(f'  \033[0;32m✔\033[0m  {mod} {ver}')
    except ImportError:
        print(f'  \033[0;31m✘\033[0m  {mod} NOT INSTALLED')
try:
    import torch
    cuda = torch.cuda.is_available()
    print(f'  {chr(10004) if cuda else chr(9888)}  CUDA: {cuda}')
except: pass
try:
    import onnxruntime as ort
    print(f'  \033[0;32m✔\033[0m  onnxruntime {ort.__version__}')
except ImportError:
    print('  \033[1;33m⚠\033[0m  onnxruntime not installed (needed for MDX models)')
" 2>&1 || echo "  Python check failed or timed out"
else
  warn "No .venv found — skipping Python/ML checks (run from WSL with venv activated)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}✘ $ERRORS error(s)${NC}, $WARNINGS warning(s)"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${GREEN}✔ All required vars present${NC} — ${YELLOW}$WARNINGS warning(s)${NC}"
  exit 0
else
  echo -e "${GREEN}✔ All checks passed${NC}"
  exit 0
fi
