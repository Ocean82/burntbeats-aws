# Burnt Beats

Personal / operator reference: **stem separation + in-browser mixer + export**, shipped as a SPA on **React (Vite)** with a **Node (Express)** API, **Python FastAPI** inference service, optional **S3** stem delivery, **Clerk** auth, and **Stripe** subscriptions / usage tokens.

End users of the public site do not read this repo; this file is for **direction and deploy consistency** (especially **EC2 + Docker Compose** builds).

---

## What the stack does today

| Layer | Role |
|-------|------|
| **`frontend/`** | Upload, plan gating, polling, waveforms, mixer (Web Audio), export (**WAV**, **MP3**, **ZIP** of job stems; optional **server master** when env flags allow). Clerk + Stripe.js. |
| **`backend/`** | Auth/usage, proxy to stem service, **`/api/stems/file`**, presigned S3 redirects, billing webhooks, malware scan hooks, rate limits, optional **`POST /api/stems/server-export`**. |
| **`stem_service/`** | FastAPI: **2-stem** default, **expand to 4**, quality modes, SCNet / hybrid Demucs paths (**see `docs/stem-pipeline.md`** — single source of truth for routing). Optional S3 upload after job. |
| **`docker-compose.yml`** | Production-shaped local / EC2 stack: `frontend` (nginx :5173→80), `backend`, `stem_service`, shared `tmp/stems` + `models`. |
| **`models/` / `server_models/`** | ONNX / PyTorch artifacts mounted into `stem_service` (layout in `docs/MODELS-INVENTORY.md`). |

**Not in the Compose path:** **`stem_api/`** (Rust) is **legacy / unused** by current deploy — see `docs/archive/IMPLEMENTATION-HYBRID.md`. **`gamer_tag/`** and **`burnt-beats-pricing-structure/`** are separate sandbox/marketing Vite apps.

---

## Runtime flow (happy path)

1. Browser → **`POST /api/stems/split`** (Node: auth, metering, upload verify) → **`stem_service`**.
2. Stem service returns **202** + `job_id`; work runs asynchronously (queued concurrency configurable).
3. Browser polls **`GET /api/stems/status/:job_id`**.
4. Stems load via **`GET /api/stems/file/:job_id/:stemId.wav`** (disk stream or **302** to S3 presigned URL when `progress.json` has `s3` metadata).
5. Mix / export in browser; see **`docs/ARCHITECTURE-FLOW.md`** for **client vs optional server** export.

---

## Quick start (Docker Compose)

From repo root:

```bash
docker compose build
docker compose up -d
docker compose ps
```

Health checks:

```bash
curl -fsS http://127.0.0.1:5173/api/health
curl -fsS http://127.0.0.1:5000/health
```

- Frontend (nginx): `127.0.0.1:5173` — same-origin **`/api/*`** is reverse-proxied to the backend container.
- Backend (Express): `127.0.0.1:3001` (published in default `docker-compose.yml` for localhost debugging; production often hides this behind the edge proxy only).
- Stem service: `127.0.0.1:5000`

---

## Local dev (non-Docker)

Scripts under `scripts/` (run from repo root, bash):

- `bash scripts/run-all-local.sh`
- `bash scripts/run-stem-service.sh`
- `bash scripts/run-backend.sh`
- `bash scripts/run-frontend.sh`

Helpers:

- `bash scripts/check-models.sh`
- `bash scripts/check-segments.sh`
- `bash scripts/test-stem-splits.sh`

---

## Environment variables (operator cheat sheet)

Primary file for Compose: **root `.env`** (see each service’s `.env.example` where present).

| Area | Examples |
|------|----------|
| Frontend build (`VITE_*`) | `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, optional `VITE_API_BASE_URL`, `VITE_GA_MEASUREMENT_ID` |
| Auth | `CLERK_SECRET_KEY`, Clerk webhook signing secret |
| Billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*` |
| Metering | **`USAGE_TOKENS_ENABLED`** |
| Job hardening | **`JOB_TOKEN_SECRET`** (per-job `x-job-token`), optional **`API_KEY`** |
| Optional **server master export** | **`SERVER_EXPORT_ENABLED=1`** (backend) · **`VITE_SERVER_EXPORT_ENABLED=1`** (frontend build) — **`docs/ARCHITECTURE-FLOW.md`**. Default Compose **does not** enable this. |
| S3 | `S3_ENABLED`, bucket/region/keys, `S3_DELETE_LOCAL_AFTER_UPLOAD`; bucket CORS if browsers fetch presigned URLs |

**Important behaviors**

- Split/expand require Clerk when **`USAGE_TOKENS_ENABLED=1`** (see `backend/server.js` startup checks in production).
- **`JOB_TOKEN_SECRET`** binds status/file reads to signed tokens when set.
- **`API_KEY`**, if set, gates administrative routes / gateway auth per server config.

---

## Deployment (AWS EC2 target)

Typical loop (Ubuntu + Docker):

```bash
git pull --ff-only origin main
docker compose build --no-cache backend frontend stem_service
docker compose up -d backend frontend stem_service
docker compose ps
```

Details:

- **`docs/DEPLOY-DOCKER-EC2.md`**
- **`docs/DEPLOY-SERVER-BUNDLE.md`**
- **`docs/DEPLOY-MARKETING-SITE.md`** (separate pricing site package)

Pre-flight: **`docs/PRODUCTION-READINESS-CHECKLIST.md`** · **`docs/SANITY-CHECKS.md`**.

---

## Security reminders

- Never commit real **`.env`** secrets.
- Rotate keys if they appear in logs.
- Keep stem service and temp dirs on **trusted** networks; enforce TLS at the edge for production.

---

## Documentation map

**Canonical “what runs”**

1. This **`README.md`** — stack + deploy overview  
2. **`docs/ARCHITECTURE-FLOW.md`** — request path, export, billing hooks, ops  
3. **`docs/stem-pipeline.md`** — model routing & quality modes  

**Index of everything else:** **`docs/README.md`**

**Plans & backlog (not source of truth for behavior):** **`docs/roadmap/`**

**Benchmark tables (human-maintained):** **`docs/benchmarks/`**

**Archived investigations:** **`docs/archive/`**

If a document contradicts **`stem-pipeline.md`**, **`ARCHITECTURE-FLOW.md`**, or this README for **current** runtime behavior, treat it as **stale** unless it lives under **`docs/roadmap/`** or **`docs/research/`** by design.
