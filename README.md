# Burnt Beats

Personal / operator reference: **stem separation + in-browser mixer + export**, shipped as a SPA on **React (Vite)** with a **Node (Express)** API, **Python FastAPI** inference service, optional **S3** stem delivery, **Clerk** auth, and **Stripe** subscriptions / usage tokens.

End users of the public site do not read this repo; this file is for **direction and deploy consistency** (especially **EC2 + Docker Compose** builds).

---

## What the stack does today

| Layer | Role |
|-------|------|
| **`frontend/`** | Upload, plan gating, polling, waveforms, mixer (Web Audio), export (**WAV**, **MP3**, **ZIP** of job stems; optional **server master** when env flags allow). Audio-to-MIDI conversion UI with piano roll, batch conversion, and interactive note editor. Clerk + Stripe.js. |
| **`backend/`** | Auth/usage, proxy to stem/speech/midi services, **`/api/stems/file`**, presigned S3 redirects, billing webhooks, malware scan hooks, rate limits, optional **`POST /api/stems/server-export`**. |
| **`stem_service/`** | FastAPI (port 5000): **2-stem** default, **expand to 4**, quality modes, SCNet / hybrid Demucs paths (**see `docs/stem-pipeline.md`** — single source of truth for routing). Optional S3 upload after job. |
| **`speech_service/`** | FastAPI (port 5001): LavaSR-based speech enhancement/denoising. Single-worker async queue, CPU inference (PyTorch). Requires model weights in **`speech_models/`**. |
| **`midi_service/`** | FastAPI (port 5002): Audio-to-MIDI transcription via Spotify Basic Pitch. Single-worker async queue, CPU inference (TensorFlow/ONNX). Model bundled in pip package — no external weights needed. |
| **`docker-compose.yml`** | Local / EC2: `frontend` (nginx → host **5173**), **`backend`**, **`stem_service`**, **`speech_service`**, **`midi_service`**, shared **`tmp/stems`**, **`tmp/speech`**, **`tmp/midi`**, plus bind mounts **`./models`** → `/repo/models`, **`./server_models`** → `/repo/server_models`, and **`./speech_models`** → `/repo/speech_models`. |
| **`models/` vs `server_models/`** | **Weights are not baked into Docker images** (see `.dockerignore` — both dirs omitted from context). Inference reads whichever subtree **`STEM_MODELS_DIR`** names; see § **Models layout** below + `docs/MODELS-INVENTORY.md`. |

**Not in the Compose path:** **`stem_api/`** (Rust) — **archived experiment**; **`stem_api/README.md`** · **`docs/archive/IMPLEMENTATION-HYBRID.md`**.  

**Satellite Vite apps** (not bundled in main Compose):

- **`burnt-beats-pricing-structure/`** — standalone pricing/transparency (subscriptions, pay‑as‑you‑go, packs) for users who bounce before signup; see its **`README.md`**.
- **`gamer_tag/`** — casual **block-dropping** mini-game (Tetris‑like; rename before broader marketing); see **`README.md`**.

---

## Models layout (solo maintainer mental model)

1. **`models/` — canonical workstation tree**

   Filled **only where you dev** via **`scripts/copy-models.sh`** from your huge upstream stem-models **bank**. That upstream tree can reach **roughly ~100 GiB**; **`copy-models.sh` copies a reduced set into `./models`** — yet **`models/` can still become very large.** **Never rsync/sync the upstream bank—or an entire bloated `./models`**—to EC2 “just because it exists”; ship a **curated** tree instead (**next bullet**).

2. **`server_models/` — curated runtime tree used on Ubuntu**

   Build on the workstation: **`python scripts/export_server_models.py`**. That script **always resolves exports from `./models`** (see its docstring—it pins `STEM_MODELS_DIR=models` internally), then emits **`server_models/`** with exactly what inference needs.

   Typical layout on disk: **`D:\burntbeats-aws\server_models`** (Windows dev) mirrored to **`/home/ubuntu/burntbeats-aws/server_models`** on the instance. **`server_models/` is gitignored**—you maintain it per host.

3. **Container selection**

   **`stem_service/config.py`** resolves weights under **`REPO_ROOT / $STEM_MODELS_DIR`** (POSIX path inside Compose: **`/repo/models`** or **`/repo/server_models`**). Compose defaults **`STEM_MODELS_DIR=models`** (`docker-compose.yml`); **recommended for AWS:** set **`STEM_MODELS_DIR=server_models`** in root **`.env`** so prod never depends on workstation-only bulk.

4. **Reference docs**

   - [`docs/MODEL-LAYOUT.md`](docs/MODEL-LAYOUT.md) — directory / script / Docker layout
   - [`docs/MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md`](docs/MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md) — runtime path audit
   - [`docs/DEPLOY-DOCKER-EC2.md`](docs/DEPLOY-DOCKER-EC2.md) — EC2 Compose (§ Models)

---

## Runtime flow (happy path)

1. Browser → **`POST /api/stems/split`** (Node: auth, metering, upload verify) → **`stem_service`**.
2. Stem service returns **202** + `job_id`; work runs asynchronously (queued concurrency configurable).
3. Browser polls **`GET /api/stems/status/:job_id`**.
4. Stems load via **`GET /api/stems/file/:job_id/:stemId.wav`** (disk stream or S3 proxy when `progress.json` has `s3` metadata). See **[`docs/STEM-S3-AND-CPU.md`](docs/STEM-S3-AND-CPU.md)**.
5. Mix / export in browser; see **`docs/ARCHITECTURE-FLOW.md`** for **client vs optional server** export.

### Speech enhancement flow

1. Browser → **`POST /api/speech/enhance`** (Node: auth, metering, upload verify) → **`speech_service`**.
2. Speech service returns **202** + `job_id`; LavaSR inference runs asynchronously.
3. Browser polls **`GET /api/speech/status/:job_id`**.
4. Enhanced audio via **`GET /api/speech/file/:job_id/enhanced.wav`**.

### MIDI conversion flow

1. Browser → **`POST /api/midi/convert`** (Node: auth, metering, upload or stem reference) → **`midi_service`**.
2. MIDI service returns **202** + `job_id`; Basic Pitch inference runs asynchronously (2-8s typical).
3. Browser polls **`GET /api/midi/status/:job_id`** (includes piano roll note data on completion).
4. MIDI file via **`GET /api/midi/file/:job_id/output.mid`**.
5. Optional: **`POST /api/midi/merge`** combines multiple completed jobs into a multi-track MIDI Type 1 file.
6. Optional export orchestration:
   - **`POST /api/midi/export`** with `mode`, `selected_stems`, and `source_jobs`.
   - Returns **202** + `export_id` and `export_token`.
   - Poll **`GET /api/midi/export/status/:export_id`**.
   - Download archive via **`GET /api/midi/export/file/:export_id/stems.zip`** (v1 `mode=stems`).

Generated MIDI job artifacts under **`tmp/midi/<job_id>/`** also include **`metadata.json`** with conversion settings, note analysis, and an additive **`midi_file_analysis`** subtree derived from the emitted **`output.mid`** file.

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
curl -fsS http://127.0.0.1:5001/health
curl -fsS http://127.0.0.1:5002/health
```

- Frontend (nginx): `127.0.0.1:5173` — same-origin **`/api/*`** is reverse-proxied to the backend container.
- Backend (Express): `127.0.0.1:3001` (published in default `docker-compose.yml` for localhost debugging; production often hides this behind the edge proxy only).
- Stem service: `127.0.0.1:5000`
- Speech service: `127.0.0.1:5001` (requires `speech_models/` volume mount)
- MIDI service: `127.0.0.1:5002` (model bundled in package — no external weights)

---

## Local dev (non-Docker)

Scripts under `scripts/` (run from repo root, bash):

- `bash scripts/run-all-local.sh` (stem + speech + midi + backend + frontend)
- `bash scripts/run-stem-service.sh`
- `bash scripts/run-speech-service.sh` (port **5001**)
- `bash scripts/run-midi-service.sh` (port **5002**)
- `bash scripts/run-backend.sh`
- `bash scripts/run-frontend.sh`
- `node scripts/ci-preflight.mjs` (runs the same key lint/typecheck/unit/build + backend test subset as CI)

Helpers:

- `bash scripts/check-models.sh`
- `bash scripts/check-segments.sh`
- `bash scripts/test-stem-splits.sh`

### Python dependencies (uv workspace)

From repo root (requires [uv](https://docs.astral.sh/uv/)):

```bash
uv sync --package burntbeats-stem    # stem service only (recommended for daily dev)
uv sync --package burntbeats-midi    # MIDI service
uv sync --package burntbeats-speech  # speech service
```

Install all workspace packages into one venv only when you need every service locally (`uv sync --all-packages` — large download).

Lockfile: `uv lock` at repo root (`.python-version` pins **3.11** to match Docker/CI); CI verifies with `uv lock --check`.

### Database migrations

When `DATABASE_URL` is set (RDS or local Postgres), apply schema and incremental migrations after pulling schema changes:

```bash
cd backend && npm run db:migrate
```

Safe to re-run. New databases get the full schema from `backend/db-schema.sql`; existing databases get `backend/migrations/*.sql` (e.g. `jobs.split_intent`).

---

## Environment variables (operator cheat sheet)

Primary file for Compose: **root `.env`** (see each service’s `.env.example` where present).

| Area | Examples |
|------|----------|
| Frontend build (`VITE_*`) | `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, optional `VITE_API_BASE_URL`, `VITE_GA_MEASUREMENT_ID` |
| Auth | `CLERK_SECRET_KEY`, Clerk webhook signing secret |
| Billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*` |
| Metering | **`USAGE_TOKENS_ENABLED`** |
| Job hardening | **`JOB_TOKEN_SECRET`** (required in production; per-job `x-job-token`), optional **`API_KEY`** |
| Internal services | **`STEM_SERVICE_API_TOKEN`**, **`SPEECH_SERVICE_API_TOKEN`**, **`MIDI_SERVICE_API_TOKEN`** (min 16 chars; required in production via `NODE_ENV` or **`INTERNAL_SERVICE_AUTH_REQUIRED=1`**) |
| Speech service | `SPEECH_MAX_UPLOAD_MB` |
| MIDI service | `MIDI_MAX_QUEUE_DEPTH`, `MIDI_TOKEN_COST` |
| Optional **server master export** | **`SERVER_EXPORT_ENABLED=1`** (backend) · **`VITE_SERVER_EXPORT_ENABLED=1`** (frontend build) — **`docs/ARCHITECTURE-FLOW.md`**. Default Compose **does not** enable this. Ops: **`SERVER_EXPORT_MAX_CONCURRENT`**, **`SERVER_EXPORT_TIMEOUT_MS`**, **`SERVER_EXPORT_RATE_LIMIT_*`**. |
| Redis (optional) | **`REDIS_URL`** — distributed rate limits (global, stem-file, server-export), status cache, Stripe webhook idempotency. In-memory fallback with **`RATE_LIMIT_MAX_ENTRIES`** when unset. |
| S3 | `S3_ENABLED`, bucket/region/keys, `S3_DELETE_LOCAL_AFTER_UPLOAD`; stem_service **`STEM_S3_UPLOAD_MAX_WORKERS`** / **`STEM_S3_UPLOAD_TIMEOUT_SEC`**; bucket CORS if browsers fetch presigned URLs |

**Important behaviors**

- Split/expand require Clerk when **`USAGE_TOKENS_ENABLED=1`** (see `backend/server.js` startup checks in production).
- Production backend **exits on startup** if **`JOB_TOKEN_SECRET`** or any internal service API token is missing/too short.
- **`JOB_TOKEN_SECRET`** binds status/file reads to signed HMAC tokens; stem/speech/MIDI routes enforce DB ownership via Clerk when a `jobs` row exists (job token fallback for legacy jobs).
- Python workers on `:5000`–`:5002` require matching `X-*-Service-Token` headers in production; Compose sets **`INTERNAL_SERVICE_AUTH_REQUIRED=1`** on speech and MIDI services (stem uses `SENTRY_ENVIRONMENT=production`).
- Ports `:5000`–`:5002` are bound to `127.0.0.1` on the host for defense in depth.
- **`API_KEY`**, if set, gates administrative routes / gateway auth per server config.

---

## Deployment (AWS EC2 target)

Typical loop (Ubuntu + Docker):

```bash
git pull --ff-only origin main
# After backend schema changes (new columns, tables):
cd backend && npm run db:migrate && cd ..
docker compose build --no-cache backend frontend stem_service speech_service midi_service
docker compose up -d
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

**Env & integrations:** **`docs/ENVIRONMENT-MATRIX.md`** · **Legal / policy routing:** **`docs/LEGAL-LAYOUT.md`**

**Plans & backlog (not source of truth for behavior):** **`docs/roadmap/`**

**Benchmark tables (human-maintained):** **`docs/benchmarks/`**

**Archived investigations:** **`docs/archive/`**

If a document contradicts **`stem-pipeline.md`**, **`ARCHITECTURE-FLOW.md`**, or this README for **current** runtime behavior, treat it as **stale** unless it lives under **`docs/roadmap/`** or **`docs/research/`** by design.
