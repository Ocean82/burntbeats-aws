# Burnt Beats

Stem splitting and remix web app with a React frontend, Node backend, and Python stem service.

## Current Architecture

- `frontend/` - React + Vite UI (upload, split, mix, export)
- `backend/` - Express API (auth, billing, split proxy, status, stem file serving)
- `stem_service/` - FastAPI inference service (2-stem, 4-stem, expand)
- `docker-compose.yml` - production-style local stack
- `models/` - model files mounted into `stem_service`

## Runtime Flow

1. Frontend calls backend `/api/stems/split`.
2. Backend validates auth/usage, scans upload, forwards to `stem_service`.
3. `stem_service` creates a job and writes progress under `tmp/stems`.
4. Frontend polls `/api/stems/status/:job_id`.
5. Completed stems load from `/api/stems/file/:job_id/:stemId.wav`.

## Quick Start (Recommended: Docker Compose)

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

Notes:

- Frontend is exposed on `127.0.0.1:5173`.
- Backend runs inside compose network (not host-published by default).
- Stem service is exposed on `127.0.0.1:5000`.

## Local Dev Scripts (Non-Docker)

All scripts are under `scripts/` and run from repo root:

- `bash scripts/run-all-local.sh`
- `bash scripts/run-stem-service.sh`
- `bash scripts/run-backend.sh`
- `bash scripts/run-frontend.sh`

Useful test helpers:

- `bash scripts/check-models.sh`
- `bash scripts/check-segments.sh`
- `bash scripts/test-stem-splits.sh`

## Environment Variables

Primary environment file for compose: root `.env`.

Commonly used keys:

- Frontend build args: `VITE_*`
- Auth: `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- Billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*`
- Job protection: `JOB_TOKEN_SECRET`
- Optional gateway key auth: `API_KEY`
- Usage metering toggle: `USAGE_TOKENS_ENABLED`

Important behavior:

- If `USAGE_TOKENS_ENABLED=1`, split endpoints require valid Clerk auth.
- If `API_KEY` is set, backend enforces `x-api-key`.
- If `JOB_TOKEN_SECRET` is set, per-job token checks are enabled on status/file endpoints.

## Deployment

Primary deployment target is Ubuntu on AWS EC2 using Docker Compose.

Core deploy loop:

```bash
git pull --ff-only origin main
docker compose build --no-cache backend frontend stem_service
docker compose up -d backend frontend stem_service
docker compose ps
```

Use these docs for deployment details:

- `docs/DEPLOY-DOCKER-EC2.md`
- `docs/DEPLOY-SERVER-BUNDLE.md`
- `docs/DEPLOY-MARKETING-SITE.md`

## Security

- Do not commit secrets in `.env`.
- Rotate secrets if exposed in logs or terminal output.
- Keep `stem_service` bound to trusted network paths only.

## Documentation Index

See `docs/README.md` for the curated, current documentation map.
