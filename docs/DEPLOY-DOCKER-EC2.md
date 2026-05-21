# Docker Compose on EC2 (production sync)

**Purpose:** Describe how the app is typically run in production on **Ubuntu EC2** when **Docker Compose** is the runtime (see root **`docker-compose.yml`** and **`backend/`**, **`frontend/`**, **`stem_service/`** Dockerfiles).

**Related:** [DEPLOY-SERVER-BUNDLE.md](DEPLOY-SERVER-BUNDLE.md) (tarball/rsync of source without large dirs), [PRODUCTION-READINESS-CHECKLIST.md](PRODUCTION-READINESS-CHECKLIST.md).

---

## What runs where

| Service | Port (host) | Role |
|---------|-------------|------|
| **frontend** | `127.0.0.1:5173` → container 80 | nginx + Vite SPA; proxies **`/api/`** → backend |
| **backend** | `127.0.0.1:3001` | Node API (auth, stems, speech, midi, billing) |
| **stem_service** | `127.0.0.1:5000` | CPU stem separation (Demucs / MDX / hybrid) |
| **speech_service** | `127.0.0.1:5001` | LavaEnhance2 speech clean/enhance |
| **midi_service** | `127.0.0.1:5002` | Audio → MIDI (Basic Pitch) |

**Startup order:** `speech_service` and `midi_service` must become **healthy** before **backend** starts; **frontend** waits on **backend**. If speech models are missing, the whole public site can stay down even when stem code is fine.

| Piece | Role |
|-------|------|
| **Host nginx** | Often **`location /`** → **`http://127.0.0.1:5173`**. HTTPS and large uploads are configured on the host. |
| **API from the browser** | The browser only talks to **https://your-domain** on **443**; no separate public API port is required. |

**Important:** Rebuilding **`frontend/dist/`** on the host with **`npm run build`** alone does **not** update the live site if traffic goes to the **frontend container**. You must **rebuild the frontend image** and **recreate the container** (or change nginx to serve static files from disk, which this doc does not assume).

---

## Environment and secrets

- Compose reads **`VITE_*`** build args from a **repo-root `.env`** (see **`docker-compose.yml`** `args:`). Keep that file **out of git**; copy from **`.env.example`** patterns per app.
- **`stem_service`:** Compose loads optional **`stem_service/.env`** (`env_file`, `required: false`). Use it for pipeline tuning (Demucs bootstrap, mmap, metrics path, etc.) without editing `docker-compose.yml`. **Precedence:** any variable also set under the service’s `environment:` block in **`docker-compose.yml`** wins over `stem_service/.env` — production paths like `STEM_OUTPUT_DIR` stay explicit in compose.
- **`backend/.env`** is not wired as `env_file` in compose; the backend container gets env from the compose `environment:` block plus substitution from the **repo-root** `.env`. Keep **`backend/.env`** for native `run-backend.sh` / docs if you use it.
- Avoid sharing raw output of `docker compose config` in tickets/chat/screenshots; it can inline resolved secret values.

### Secret safety checklist

- Store production secrets in a secret manager or protected host env, not committed `.env` files.
- Treat any accidentally shared compose/env output as exposed.
- If exposure is suspected, rotate immediately: Stripe secret/webhook keys, Clerk secret, API/job token secrets, and any AWS keys.
- After rotation, redeploy and re-run health checks (`/api/health`, stem `/health`).

---

## Routine sync (git on the server)

From the repo clone on the instance (example path: **`/home/ubuntu/burntbeats-aws`**):
```bash
cd /home/ubuntu/burntbeats-aws
git pull --ff-only origin main
```

If the working tree has local edits, **stash or commit** before pulling.

Then rebuild only what changed:

```bash
# UI / Vite env → rebuild frontend
sudo docker compose build frontend

# Node API routes / deps
sudo docker compose build backend

# Stem separation (CPU PyTorch — slowest cold build)
sudo docker compose build stem_service

# Speech clean (LavaSR)
sudo docker compose build speech_service

# MIDI convert
sudo docker compose build midi_service
```

Apply (recreate containers that use the images you just built):

```bash
sudo docker compose up -d
```

If you **only** rebuilt one service, you can recreate just that service (faster, less disruption):

```bash
sudo docker compose up -d stem_service
# or: frontend | backend
```

Use **`sudo`** if the **`ubuntu`** user is not in the **`docker`** group (default **`docker.sock`** permissions).

**Rebuild frontend** whenever **`frontend/`** sources or **`VITE_*`** values used at build time change.

---

## Build time and what to expect

- A **full** **`sudo docker compose build`** (all services, cold cache) can take **on the order of 10+ minutes** on a typical CPU EC2 node. Most of that is usually **`stem_service`**: **`pip install`** for PyTorch and related deps inside the image, plus exporting a large image layer.
- **`docker compose build --parallel`** can build **frontend** and **backend** alongside **`stem_service`** when you need everything; otherwise build **only the service you changed** (see commands above) so layer cache applies and deploys stay short.
- After **`requirements.txt`** or **`stem_service/`** Python changes, you **must** rebuild **`stem_service`**; editing code on the host does not change the running container until you **build** and **recreate**.

---

## Docker container name conflicts

If **`docker compose up`** or **`build`** fails with **“container name … is already in use”** (often after an interrupted recreate), the stack can be left with duplicate or half-removed containers.

**Reliable reset** (brief downtime for the app):

```bash
cd /home/ubuntu/burntbeats-aws
sudo docker compose down
sudo docker compose up -d
```

Then confirm **`sudo docker compose ps`** shows all services **healthy**. Do **not** confuse this with unrelated host **`systemd`** units (e.g. an old FastAPI service under a different path); see **Pitfalls** below.

---

## Manual setup on the server (only these are not in git)

Everything else deploys via **`git pull`** + **`docker compose build`**. You should only maintain these by hand:

### 1. Repo-root `.env`

Copy from **`.env.example`** / **`.server-sync/`** templates. Must include at least:

- **Auth / billing:** `CLERK_*`, `STRIPE_*`, `JOB_TOKEN_SECRET`
- **Stem:** `STEM_MODELS_DIR=server_models`, optional `S3_ENABLED`, `S3_BUCKET`, …
- **Frontend build args:** `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_STRIPE_*`, … (baked into the **frontend image** at build time)
- **Speech / MIDI tokens:** `SPEECH_SERVICE_API_TOKEN`, `MIDI_SERVICE_API_TOKEN` (must match between backend and services)

Never commit production `.env` to git.

### 2. Stem weights — `server_models/`

- **`models/`** stays on the workstation (populate with **`scripts/copy-models.sh`**). Never rsync the full bank to EC2.
- **`server_models/`** is the production payload: on the workstation run **`python scripts/export_server_models.py`**, then **`rsync -avz ./server_models/ ubuntu@HOST:/home/ubuntu/burntbeats-aws/server_models/`**.
- Root **`.env`:** **`STEM_MODELS_DIR=server_models`**. Compose bind-mounts **`./server_models`** → **`/repo/server_models`** (or **`/repo/models`** when unset).

### 3. Speech weights — `speech_models/` (LavaSR)

Gitignored. Layout: **`speech_models/LAYOUT.txt`**. Required files:

- `speech_models/enhancer_v2/config.yaml`
- `speech_models/enhancer_v2/model.safetensors` **or** `pytorch_model.bin`
- `speech_models/denoiser/denoiser.safetensors` **or** `denoiser.bin`

**One-time download on EC2** (from repo root, ~60 MB):

```bash
python3 -m pip install --user huggingface_hub
export PATH="$HOME/.local/bin:$PATH"
hf download YatharthS/LavaSR --local-dir speech_models
test -f speech_models/enhancer_v2/config.yaml && echo OK
sudo docker compose up -d --force-recreate speech_service
```

Or on a workstation with bash: **`bash scripts/fetch-speech-models.sh`** then rsync **`speech_models/`** to the server.

**If speech weights are missing:** `speech_service` stays unhealthy → **backend** and **frontend** never start. Symptom: **`curl http://127.0.0.1:5173/`** connection refused.

Optional overlay **`docker-compose.speech-optional.yml`** relaxes the speech health gate (stems work; `/speech` routes fail until weights exist). Prefer fixing **`speech_models/`** on production.

### 4. Runtime dirs (auto-created)

- **`tmp/stems`**, **`tmp/speech`**, **`tmp/midi`** — job output; compose mounts them. No manual seeding.

**Images stay small:** **`.dockerignore`** omits **`models/`**, **`server_models/`**, **`speech_models/`** from build context—weights use **volume mounts** only.

---

## Local Compose override (no bind mounts)

Some dev machines (**WSL2**, antivirus scanning bind mounts, slow disks) choke on `./tmp/stems`, `./models`, or `./server_models` bind mounts.

Use **`docker-compose.local-nobind.yml`** as a **fragment** merged **explicitly**:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-nobind.yml up -d
```

It replaces those paths with **named Docker volumes** and sets **`backend`** to **`NODE_ENV=development`** with **`DEV_BYPASS_UPLOAD_AUTH=1`**. **Do not** use this file on production EC2—it weakens metering/auth assumptions on the Node API.

Default **`docker compose up`** on CI/production should keep using root **`docker-compose.yml`** alone.

---

## When to use tarball / rsync instead

Use **[DEPLOY-SERVER-BUNDLE.md](DEPLOY-SERVER-BUNDLE.md)** when you are **copying a tree** without git (first install, air-gapped step, or policy). After files land on the server, **still** run **`docker compose build`** and **`up -d`** if production is containerized.

---

## Pitfalls

- **Wrong systemd unit:** An old **`burntbeats-api.service`** (or similar) pointing at a different path (e.g. FastAPI under **`/home/ubuntu/app`**) is **not** this stack. Restarting it will not update **`docker-compose`** services and may fail if paths/env are stale.
- **Stale API in the browser:** If **`VITE_API_BASE_URL`** or other **`VITE_*`** values change, rebuild the **frontend** image so the new bundle is baked in.
- **Assuming host `npm run build` updated the site:** Production usually serves the **frontend container** on the host-mapped port (e.g. **5173**). Rebuild the **image** and **recreate** the **frontend** service unless nginx is explicitly pointed at **`frontend/dist/`** on disk.

---

## Quick verification

```bash
sudo docker compose ps    # all five services: healthy

curl -fsS http://127.0.0.1:5173/              # frontend HTML
curl -fsS http://127.0.0.1:5173/api/health    # backend via frontend proxy
curl -fsS http://127.0.0.1:5000/health        # stem_service
curl -fsS http://127.0.0.1:5001/health        # speech_service
curl -fsS http://127.0.0.1:5002/health        # midi_service
```

From your laptop: **`python scripts/post_deploy_smoke.py`** — public URLs (`/pricing`, legal pages, etc.) → report under **`docs/deploy-reports/`**.

## Airport / quick redeploy cheat sheet

```bash
ssh -i ~/.ssh/server_saver_key ubuntu@52.0.207.242
cd /home/ubuntu/burntbeats-aws
git pull --ff-only origin main
sudo docker compose build frontend backend stem_service speech_service midi_service
sudo docker compose up -d
sudo docker compose ps
```

Rebuild **only** what you changed to save time. After **`VITE_*`** edits: **`sudo docker compose build --no-cache frontend`**.

Adjust host/port if your **`docker-compose.yml` port mappings differ.
