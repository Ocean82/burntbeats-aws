# Follow-ups and deferred work

**Purpose:** Track items intentionally left open so they are not lost during other cleanup. This file is **not** deployed with the app (docs-only). **Do not put real secrets here** — use placeholders and variable names only.

**Last updated:** 2026-03-22

---

## Environment and naming

| Topic | Status | What to resolve |
|--------|--------|------------------|
| Backend vs frontend URLs | Partially aligned | `VITE_API_BASE_URL` must match where the Express API listens (`PORT` / reverse proxy). For production builds, point the frontend at the real API origin (not localhost). |
| Clerk + Stripe key “mode” | Mixed envs possible | Align **test vs live** for Clerk publishable vs Stripe publishable vs backend Stripe secret when you want a single consistent environment. |
| `FRONTEND_ORIGINS` (backend) | Single source | Only **`FRONTEND_ORIGINS`** is read by `server.js` — not `CORS_ORIGIN` / `CORS_ALLOW_ORIGINS` / `CLIENT_URL` (see cleaned `backend/.env` comments). |
| S3 bucket name | Renamed in backend | Backend and **`stem_service`** expect **`S3_BUCKET`** (not `AWS_S3_BUCKET`). Same bucket/region/prefix in both places. |
| Optional vars in `backend/.env` | Commented block | Database, Redis, email, EC2 metadata, session/JWT/CSRF — **not used** by current Express code; kept commented for future services or removed when you centralize secrets. |

---

## S3 (uploads + presigned GET)

| Topic | Status | What to resolve |
|--------|--------|------------------|
| Stem service | Must enable explicitly | Set **`S3_ENABLED=true`** in the environment where **`stem_service`** runs. The Node backend does not read this flag; uploads happen in Python. |
| Credentials | Shared pattern | **`stem_service`** uses `S3_ACCESS_KEY` / `S3_SECRET_KEY` **or** default AWS credential chain (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`). |
| Presign (backend) | Needs IAM or keys | **`backend/s3Presign.js`** needs permission to **`s3:GetObject`** on the same objects the stem service uploaded. |
| Local files after upload | Optional | **`S3_DELETE_LOCAL_AFTER_UPLOAD`** — if `true`, local WAVs are removed; downloads then **require** working presign + bucket policy + **CORS** for browser `fetch` / `<audio>`. |
| Bucket CORS | Ops | Allow **GET** from your app origin for presigned URLs if the browser loads S3 directly. |
| Lifecycle | Ops | **`GET /api/stems/cleanup`** only deletes **local** job dirs; add S3 lifecycle or jobs if you stop keeping files on disk. |

---

## Server-side export (FFmpeg / mastering)

| Topic | Status | What to resolve |
|--------|--------|------------------|
| `POST /api/stems/server-export` | Stub | Returns **404** when disabled, **501** when enabled but pipeline missing. Implement worker + debit tokens (`usageTokens.computeServerExportCost` or product rules). |
| Default export | Done client-side | Master WAV remains **browser** (`useExport.ts`) until server path exists. |

---

## Frontend env (`frontend/.env`)

| Topic | Status | What to resolve |
|--------|--------|------------------|
| `VITE_API_BASE_URL` | Required | Used by `api.ts` and `useSubscription.ts`. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Required | Used by `main.tsx`. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Not referenced in `src` yet | Safe to keep for future Stripe.js / Elements; **no** current import — add when you wire checkout UI client-side. |
| `VITE_API_KEY` | Optional | Only if you add client support for **`x-api-key`** when backend **`API_KEY`** is set. |

---

## Billing and usage tokens

| Topic | Status | What to resolve |
|--------|--------|------------------|
| `USAGE_TOKENS_ENABLED` | Off by default | Turn on when Clerk + Stripe flows are ready for production metering. |
| Stripe Price metadata | Ops | `tokens_per_month` / `token_seconds_per_month` on Prices — see `BILLING-AND-TOKENS.md`. |
| Webhook | Configured in code | Ensure Stripe dashboard / CLI **`STRIPE_WEBHOOK_SECRET`** matches **`POST /api/billing/webhook`** URL in each environment. |

---

## Security hygiene (no values)

| Topic | Note |
|--------|------|
| Secret rotation | If any `.env` was ever committed or shared broadly, rotate affected keys in the respective dashboards (Clerk, Stripe, AWS, DB, Redis, SMTP). |
| `.gitignore` | Confirm `backend/.env` and `frontend/.env` remain ignored; only `*.example` templates are committed. |

---

## Related docs

- [ARCHITECTURE-FLOW.md](ARCHITECTURE-FLOW.md) — server vs client vs S3 vs billing.
- [BILLING-AND-TOKENS.md](BILLING-AND-TOKENS.md) — Stripe + tokens.
