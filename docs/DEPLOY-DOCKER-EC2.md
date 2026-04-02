# Docker Compose on EC2 (production sync)

**Purpose:** Describe how the app is typically run in production on **Ubuntu EC2** when **Docker Compose** is the runtime (see root **`docker-compose.yml`** and **`backend/`**, **`frontend/`**, **`stem_service/`** Dockerfiles).

**Related:** [DEPLOY-SERVER-BUNDLE.md](DEPLOY-SERVER-BUNDLE.md) (tarball/rsync of source without large dirs), [PRODUCTION-READINESS-CHECKLIST.md](PRODUCTION-READINESS-CHECKLIST.md).

---

## What runs where

| Piece | Role |
|-------|------|
| **Compose stack** | **`frontend`** (nginx + static SPA on container port 80), **`backend`** (Node `server.js`, port 3001), **`stem_service`** (Python, port 5000). |
| **Host nginx** | Often **`location /`** → **`http://127.0.0.1:5173`** (publish mapping from compose: host **5173** → frontend container **80**). HTTPS and large uploads are configured on the host. |
| **API from the browser** | The **frontend image** proxies **`/api/`** to **`http://backend:3001`** (see **`frontend/nginx.conf`**). The browser only talks to **https://your-domain** on **443**; no separate public port for the API is required. |

**Important:** Rebuilding **`frontend/dist/`** on the host with **`npm run build`** alone does **not** update the live site if traffic goes to the **frontend container**. You must **rebuild the frontend image** and **recreate the container** (or change nginx to serve static files from disk, which this doc does not assume).

---

## Environment and secrets

- Compose reads **`VITE_*`** build args from a **repo-root `.env`** (see **`docker-compose.yml`** `args:`). Keep that file **out of git**; copy from **`.env.example`** patterns per app.
- **`backend/.env`** and stem service settings must match what Compose passes or mounts (see compose `environment:` blocks).

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
# Typical: UI / Vite env → rebuild frontend
sudo docker compose build frontend

# API changes
sudo docker compose build backend

# Python stem pipeline / requirements
sudo docker compose build stem_service
```

Apply:

```bash
sudo docker compose up -d
```

Use **`sudo`** if the **`ubuntu`** user is not in the **`docker`** group (default **`docker.sock`** permissions).

**Rebuild frontend** whenever **`frontend/`** sources or **`VITE_*`** values used at build time change.

---

## Models and data

- **`models/`** is large and usually **not** in git. On the server it is often mounted into **`stem_service`** (see compose **`volumes:`**). Sync models with **`scripts/copy-models.sh`** or a targeted **`rsync`** (see [DEPLOY-SERVER-BUNDLE.md](DEPLOY-SERVER-BUNDLE.md) §2).
- **`tmp/stems`** (or compose **`STEM_OUTPUT_DIR`**) is runtime output; compose may mount **`./tmp/stems`**.

---

## When to use tarball / rsync instead

Use **[DEPLOY-SERVER-BUNDLE.md](DEPLOY-SERVER-BUNDLE.md)** when you are **copying a tree** without git (first install, air-gapped step, or policy). After files land on the server, **still** run **`docker compose build`** and **`up -d`** if production is containerized.

---

## Pitfalls

- **Wrong systemd unit:** An old **`burntbeats-api.service`** (or similar) pointing at a different path (e.g. FastAPI under **`/home/ubuntu/app`**) is **not** this stack. Restarting it will not update **`docker-compose`** services and may fail if paths/env are stale.
- **Stale API in the browser:** If **`VITE_API_BASE_URL`** or other **`VITE_*`** values change, rebuild the **frontend** image so the new bundle is baked in.

---

## Quick verification

- **`sudo docker compose ps`** — services **healthy**.
- **`curl -fsS http://127.0.0.1:5173/`** (or your mapped host port) — HTML from the frontend container.
- **`curl -fsS http://127.0.0.1:5173/api/health`** — proxied backend health (through the frontend container’s nginx).

Adjust host/port if your **`docker-compose.yml` port mappings differ.
