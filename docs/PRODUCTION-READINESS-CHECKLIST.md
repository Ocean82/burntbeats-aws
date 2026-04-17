# Production Readiness Checklist

This checklist is intentionally short and repeatable before each deploy.

## 1) Environment Safety

- Run `bash scripts/check_env.sh` from repo root.
- Confirm:
  - `USAGE_TOKENS_ENABLED` is on
  - `ALLOW_UNMETERED_PROD` is off/unset
  - `DEV_BYPASS_UPLOAD_AUTH` is off/unset
  - Stripe and Clerk key environments match (`live` with `live`, `test` with `test`)

## 2) Billing/Identity Consistency (Read-only)

- Run:
  - `node scripts/audit-stripe-clerk-consistency.mjs`
- Review output for:
  - missing `customer.metadata.clerkUserId`
  - missing Clerk `public_metadata.stripeCustomerId`
  - missing Clerk `private_metadata.usageTokens` for active subscriptions

## 3) Server Secret Hygiene

- On server, ensure live env files are owner-only:
  - `/home/ubuntu/burntbeats-aws/.env`
  - `/home/ubuntu/burntbeats-aws/backend/.env`
  - `/home/ubuntu/burntbeats-aws/frontend/.env`
  - `/home/ubuntu/burntbeats-aws/stem_service/.env` (loaded by Compose for **`stem_service`** when present; use container paths for any file-based settings — see **`stem_service/.env.example`**)
- Expected mode: `-rw-------` (`600`)

## 4) Minimal Runtime Verification

- **Docker Compose deploy (typical EC2 path):** After `git pull`, rebuild and recreate as needed — see **[DEPLOY-DOCKER-EC2.md](DEPLOY-DOCKER-EC2.md)** (single-service builds, **build duration**, **container name conflicts** → `docker compose down` / `up -d`).
- Ensure local-only override files are not used in production rollout commands (for example `docker-compose.local-nobind.yml`).
- Confirm containers healthy:
  - `sudo docker compose ps` — `backend`, `frontend`, `stem_service` report **healthy** (or equivalent).
- Confirm endpoint behavior:
  - `GET /api/health` -> `200`
  - anonymous `GET /api/billing/subscription` -> `401`
  - anonymous multipart `POST /api/stems/split` -> `401`

## 5) Scanner Noise (Operational)

- Scanner traffic is expected on public hosts.
- Keep nginx deny rules for common probe paths (`/.env`, `/.git`, `wp-*`, `/ui/*`, `/uax`).
- Optional: tune fail2ban/nginx jails and edge WAF if noise or abuse increases.

