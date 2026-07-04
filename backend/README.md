# Burnt Beats Backend

Node.js (Express) API server — proxy, auth, billing, and file serving for the stem separation workstation.

## Tech Stack

- **Node.js 20** + ES modules
- **Express** (HTTP framework)
- **Clerk** (authentication middleware)
- **Stripe** (subscription + webhook handling)
- **PostgreSQL** via `pg` (job tracking, usage metering, stem history)
- **Redis** (optional — distributed rate limits, webhook deduplication)
- **multer** (file upload handling)
- **Sentry** (error monitoring)

## Quick Start

```bash
npm install
cp .env.example .env     # Fill in DATABASE_URL, CLERK_SECRET_KEY, etc.
npm run db:migrate       # Apply PostgreSQL schema
npm run dev              # http://localhost:3001
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Express with `--watch` mode |
| `npm run start` | Production start (`--env-file=.env`) |
| `npm run db:migrate` | Apply database migrations (idempotent) |
| `npm test` | Node built-in test runner |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run catalog:generate` | Generate MIDI preset catalog |
| `npm run catalog:health` | Check catalog integrity |
| `npm run stripe:listen` | Forward Stripe webhooks locally |

## Architecture

### Request Flow

```
Browser → nginx (/api/*) → Express (auth + rate limit) → Internal services
                                                        ├── stem_service :5000
                                                        ├── speech_service :5001
                                                        └── midi_service :5002
```

### Key Responsibilities

- **Authentication** — Clerk JWT verification, session management
- **Usage metering** — Token-based billing (tracks per-job costs)
- **File proxy** — Serves stem/MIDI/speech files from local disk or S3
- **Job lifecycle** — Tracks job states in PostgreSQL, handles cancellation
- **Rate limiting** — Redis-backed sliding window (in-memory fallback)
- **Webhook handling** — Stripe (payments) + Clerk (user events)
- **Malware scanning** — ClamAV integration for uploaded files

### Database

- Schema: `backend/db-schema.sql`
- Migrations: `backend/migrations/*.sql`
- Connection: `DATABASE_URL` env var (PostgreSQL with SSL)

### Internal Service Auth

In production (`NODE_ENV=production`), all internal service calls require signed tokens:
- `STEM_SERVICE_API_TOKEN` → `X-Stem-Service-Token` header
- `SPEECH_SERVICE_API_TOKEN` → `X-Speech-Service-Token` header
- `MIDI_SERVICE_API_TOKEN` → `X-Midi-Service-Token` header

Minimum 16 characters. Server exits on startup if missing.

## Testing

- Uses Node's built-in test runner (`node --test`)
- Tests run with `DEV_BYPASS_UPLOAD_AUTH=1` for isolation
- CI enforces `npm audit --audit-level=high`

## Environment Variables

See `backend/.env.example` for the full list. Key variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Yes | Clerk authentication |
| `STRIPE_SECRET_KEY` | Yes | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook verification |
| `JOB_TOKEN_SECRET` | Prod | HMAC signing for per-job access tokens |
| `STEM_SERVICE_URL` | Yes | Stem service endpoint (default: http://127.0.0.1:5000) |
| `REDIS_URL` | Optional | Distributed rate limits + caching |
| `S3_BUCKET` | Optional | S3 stem file storage |
