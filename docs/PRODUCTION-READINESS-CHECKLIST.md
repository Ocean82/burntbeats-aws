# Production Readiness Checklist

This checklist is intentionally short and repeatable before each deploy.

## 1) Environment Safety

- Run `bash scripts/check_env.sh` from repo root.
- Confirm:
  - `USAGE_TOKENS_ENABLED` is on
  - `ALLOW_UNMETERED_PROD` is off/unset
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
  - `/home/ubuntu/burntbeats-aws/stem_service/.env`
- Expected mode: `-rw-------` (`600`)

## 4) Minimal Runtime Verification

- Confirm containers healthy:
  - `backend`, `frontend`, `stem_service`
- Confirm endpoint behavior:
  - `GET /api/health` -> `200`
  - anonymous `GET /api/billing/subscription` -> `401`
  - anonymous multipart `POST /api/stems/split` -> `401`

## 5) Scanner Noise (Operational)

- Scanner traffic is expected on public hosts.
- Keep nginx deny rules for common probe paths (`/.env`, `/.git`, `wp-*`, `/ui/*`, `/uax`).
- Optional: tune fail2ban/nginx jails and edge WAF if noise or abuse increases.

