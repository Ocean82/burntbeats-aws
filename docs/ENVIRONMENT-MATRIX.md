# Environment variables matrix

Single map of **who reads what** across **Docker Compose**, **bare-metal scripts**, and **Vite**. Values marked **build-time** must match at image rebuild; **runtime** picks up on container/process restart.

**Secrets:** Never commit `.env`. Production: **0600** perms (see **`docs/PRODUCTION-READINESS-CHECKLIST.md`**).

---

## 1. Compose / orchestration

| Scope | Source | Purpose |
|--------|--------|---------|
| All services | Repo root **`.env`** | Substituted into **`docker-compose.yml`** (`${VAR}`, `build.args`, `stem_service.environment`) |
| `stem_service` only | **`stem_service/.env`** | Optional pipeline tuning (**`required: false`**). Keys duplicated in **`docker-compose.yml` `environment:`** **win**. |

Compose file: **`docker-compose.yml`** · optional **`docker-compose.local-nobind.yml`** (dev volumes) — **`docs/DEPLOY-DOCKER-EC2.md`**.

---

## 2. Frontend (Vite) — **`frontend/.env`** / Compose **`args:`**

Baked into **`frontend/dist`** at **`docker compose build frontend`**.

| Variable | Required prod | Meaning |
|-----------|----------------|---------|
| `VITE_API_BASE_URL` | Optional | API origin; omit for same-origin via nginx **`/api`**. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk browser key (`pk_live_…` prod). |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Strongly yes | Stripe.js (`pk_live_…`). |
| `VITE_STRIPE_PRICING_TABLE_ID` | Optional | Embedded pricing tables. |
| `VITE_STRIPE_CUSTOMER_PORTAL_URL` | Optional | Override portal shortcut. |
| `VITE_STRIPE_PACKAGE_PRICING_TABLE_ID` | Optional | Typed in **`vite-env.d.ts`**. |
| `VITE_GA_MEASUREMENT_ID` | Optional | GA4 (**`G-…`**). |
| `VITE_MAX_UPLOAD_BYTES` | Optional | Cap upload UI (align **`backend`** `MAX_UPLOAD_BYTES`). |
| `VITE_SERVER_EXPORT_ENABLED` | Optional | Enables client attempts at **`POST /api/stems/server-export`**. Match **`SERVER_EXPORT_ENABLED`** backend. |
| **`VITE_LOCAL_DEV_FULL_APP`** | Dev only | Skips Clerk in **development** mode only (**`src/config.ts`**); ignored in prod build. |

**Playwright CI:** Starts dev server with **`VITE_LOCAL_DEV_FULL_APP=1`** — **`frontend/playwright.config.ts`**.

---

## 3. Backend (Node Express) — root `.env` in Compose **`environment:`** or **`backend/.env`** for **`run-backend.sh`**

| Variable | Critical | Meaning |
|-----------|-----------|---------|
| `PORT` | Default 3001 | Listen port. |
| `PUBLIC_BASE_URL` | HTTPS prod | Correct stem URLs behind TLS proxies. |
| `STEM_SERVICE_URL` | Yes | Compose: **`http://stem_service:5000`**. |
| `STEM_OUTPUT_DIR` | Match stem | Writable job dir (**must match stem `STEM_OUTPUT_DIR`** logically). |
| `FRONTEND_ORIGINS` | CORS | Allowed browser origins (**`allowedOrigins.js`**). |
| `CLERK_SECRET_KEY` | Prod | JWT verification. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Prod webhooks | `user.created` / welcome grants. |
| **`LEGAL_TOS_VERSION`** | Acceptance gate | **Must match **`frontend/src/legal/versions.ts` → `LEGAL_VERSIONS.tos`** (default in code should track that file). |
| **`LEGAL_PRIVACY_VERSION`** | Same | Matches **`LEGAL_VERSIONS.privacy`**. |
| `STRIPE_*` | Billing | **`docs/BILLING-AND-TOKENS.md`** |
| `USAGE_TOKENS_ENABLED` | Prod | Metering on **`/api/stems/split`**, **`/expand`**, optional **`server-export`**. |
| `JOB_TOKEN_SECRET` | Prod | Signs **`x-job-token`**. |
| `API_KEY` | Optional | Gateway / cleanup auth. |
| `SERVER_EXPORT_ENABLED` | Optional | Offline master WAV (**`stem_service/server_export.py`**). |
| S3 trio | Optional | **`s3Presign.js`** presigned GET redirects. |

Reference: **`backend/.env.example`**.

---

## 4. Stem service (Python FastAPI)

| Variable | Notes |
|----------|--------|
| `STEM_MODELS_DIR` | **`models`** (dev Compose default) vs **`server_models`** (recommended EC2) — **`docs/MODEL-LAYOUT.md`**. |
| `STEM_OUTPUT_DIR` | Job output (**`/repo/tmp/stems`** typical in Compose). |
| `FRONTEND_ORIGINS` | CORS. |
| `S3_*` / `AWS_*` | Stem upload lifecycle (**`stem_service/s3_upload.py`**). |
| ONNX / threading | **`OMP_*`**, **`ONNXRUNTIME_*`**, **`USE_SCNET`** — **`stem_service/.env.example`** |

Pipeline flags: **`stem_service/.env`** (Compose **`env_file`**, optional).

---

## 5. Cross-checks before release

| Check | Rule |
|--------|------|
| Legal acceptance | **`LEGAL_TOS_VERSION` / `LEGAL_PRIVACY_VERSION`** = **`LEGAL_VERSIONS`** in **`frontend/src/legal/versions.ts`**. |
| Stripe / Clerk modes | **`sk_live`** with **`pk_live`**, webhook secrets match Dashboard. |
| Stem paths | **`STEM_OUTPUT_DIR`** + mounts consistent across **backend** and **`stem_service`**. |

---

## Related docs

| Doc | Contents |
|-----|----------|
| [`MODEL-LAYOUT.md`](MODEL-LAYOUT.md) | **STEM_MODELS_DIR** semantics |
| [`LEGAL-LAYOUT.md`](LEGAL-LAYOUT.md) | Canonical legal markdown + versioning |
| [`BILLING-AND-TOKENS.md`](BILLING-AND-TOKENS.md) | Stripe tiers + tokens |
