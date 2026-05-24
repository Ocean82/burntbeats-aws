# Production Readiness Checklist

This checklist is intentionally short and repeatable before each deploy.

## 1) Environment Safety

- Run `bash scripts/check_env.sh` from repo root.
- Confirm:
  - `USAGE_TOKENS_ENABLED` is on
  - `ALLOW_UNMETERED_PROD` is off/unset
  - `DEV_BYPASS_UPLOAD_AUTH` is off/unset
  - Stripe and Clerk key environments match (`live` with `live`, `test` with `test`)

## 2) Legal version sync

- Backend **`LEGAL_TOS_VERSION`** / **`LEGAL_PRIVACY_VERSION`** (`server.js` defaults or root **`.env`**) **must match** **`frontend/src/legal/versions.ts`** (**`LEGAL_VERSIONS`**). Mismatch blocks **`POST /api/legal/accept`** with `400`.
- User-visible copy lives in **`frontend/src/pages/legal/`** — see **`docs/LEGAL-LAYOUT.md`**.

## 3) Billing/Identity Consistency (Read-only)

- Run:
  - `node scripts/audit-stripe-clerk-consistency.mjs`
- Review output for:
  - missing `customer.metadata.clerkUserId`
  - missing Clerk `public_metadata.stripeCustomerId`
  - missing Clerk `private_metadata.usageTokens` for active subscriptions

## 4) Server Secret Hygiene

- On server, ensure live env files are owner-only:
  - `/home/ubuntu/burntbeats-aws/.env`
  - `/home/ubuntu/burntbeats-aws/backend/.env`
  - `/home/ubuntu/burntbeats-aws/frontend/.env`
  - `/home/ubuntu/burntbeats-aws/stem_service/.env` (loaded by Compose for **`stem_service`** when present; use container paths for any file-based settings — see **`stem_service/.env.example`**)
- Expected mode: `-rw-------` (`600`)

## 5) Minimal Runtime Verification

- **Docker Compose deploy (typical EC2 path):** After `git pull`, rebuild and recreate as needed — see **[DEPLOY-DOCKER-EC2.md](DEPLOY-DOCKER-EC2.md)** (single-service builds, **build duration**, **container name conflicts** → `docker compose down` / `up -d`).
- Ensure local-only override files are not used in production rollout commands (for example `docker-compose.local-nobind.yml`).
- Confirm containers healthy:
  - `sudo docker compose ps` — **all five services** (`backend`, `frontend`, `stem_service`, `speech_service`, `midi_service`) report **healthy**.
- Confirm endpoint behavior:
  - `GET /api/health` -> `200`
  - `curl http://127.0.0.1:5000/health` -> `200` (stem_service)
  - `curl http://127.0.0.1:5001/health` -> `200` (speech_service)
  - `curl http://127.0.0.1:5002/health` -> `200` (midi_service)
  - anonymous `GET /api/billing/subscription` -> `401`
  - anonymous multipart `POST /api/stems/split` -> `401`
- Confirm inter-service connectivity (from inside backend container):
  - `docker exec <backend> node -e "..."` → `http://speech_service:5001/health` returns 200
  - `docker exec <backend> node -e "..."` → `http://midi_service:5002/health` returns 200
- Confirm shared volume mounts exist in backend:
  - `/app/tmp/stems`, `/app/tmp/speech`, `/app/tmp/midi` all present

## 6) Scanner Noise (Operational)

- Scanner traffic is expected on public hosts.
- Keep nginx deny rules for common probe paths (`/.env`, `/.git`, `wp-*`, `/ui/*`, `/uax`).
- Optional: tune fail2ban/nginx jails and edge WAF if noise or abuse increases.

