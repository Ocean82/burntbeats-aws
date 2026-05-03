# Deploy bundle (code without giant `models/`)

**Purpose:** Ship **application code** to your AWS host in one archive (or `rsync`) while **excluding** local `models/`, `node_modules/`, `.venv/`, `tmp/`, and other files you do not need on the server.

**Last updated:** 2026-03-24

---

## What gets excluded

The file **`scripts/deploy-exclude.txt`** drives both the tarball script and optional `rsync`. It omits:

| Path / pattern | Why |
|----------------|-----|
| `models/` | Large checkpoints — copy only what the pipeline needs (see below) |
| `node_modules/` | Reinstall on server with `npm ci` per app |
| `.venv/` | Recreate on server: `python3 -m venv .venv` + `pip install -r stem_service/requirements.txt` |
| `tmp/`, `benchmark_out*` | Local scratch |
| `frontend/dist/` | Rebuild after `npm ci` with your production `VITE_*` env |
| `.git/`, IDE dirs | Not needed to run |
| `.env` files | Never pack real secrets; copy from `*.env.example` on the server |

Adjust **`scripts/deploy-exclude.txt`** if you need to add more paths (e.g. another subproject’s artifacts).

**Secret hygiene:** do not paste full env files or `docker compose config` output into shared channels; they may contain resolved secrets.

---

## 1. Create the tarball (WSL / Ubuntu)

From the **repo root**:

```bash
bash scripts/package-server-bundle.sh
```

Default output: **`tmp/deploy/burntbeats-server-YYYYMMDD-HHMM.tgz`** (under the repo; `tmp/` is gitignored).

Custom path:

```bash
DEPLOY_BUNDLE_OUT=~/burntbeats-deploy.tgz bash scripts/package-server-bundle.sh
```

Upload:

```bash
scp tmp/deploy/burntbeats-server-*.tgz ubuntu@YOUR_HOST:/opt/burntbeats/
```

On the server:

```bash
cd /opt/burntbeats
tar xzf burntbeats-server-*.tgz
```

---

## 2. Models (separate step — curated payload only)

The bundle excludes large trees. **`scripts/copy-models.sh`** pulls from your stem-models **bank** **into `./models`** on whichever machine runs it—that upstream bank may be ~**100 GiB+** (do **not** upload it wholesale anywhere production touches).

### Recommended (Docker / EC2 + Compose)

On the workstation:

```bash
# 1) Populate canonical models (if not already): STEM_MODELS_SOURCE=/path/to/bank bash scripts/copy-models.sh
python scripts/export_server_models.py
rsync -avz ./server_models/ ubuntu@YOUR_HOST:/home/ubuntu/burntbeats-aws/server_models/
```

Remote **`.env`**: **`STEM_MODELS_DIR=server_models`**. Compose already mounts `./server_models:/repo/server_models` (defaults to empty dir if absent—populate it).

### Alternative — full `./models/` on the server

**Option A — workstation → server `models/`**:

```bash
rsync -avz ./models/ ubuntu@YOUR_HOST:/home/ubuntu/burntbeats-aws/models/
```

Use only after `copy-models.sh` already produced a sane subset—**still avoid rsync-ing the untouched bank.**

**Option B — run copy-models directly on server** (rare):

```bash
mkdir -p models
STEM_MODELS_SOURCE=/path/to/stem-models bash scripts/copy-models.sh
```

Do **never** expose the upstream bank publicly; Prefer **`export_server_models.py`** (**`server_models/`**) for repeatable tiny deploys.

Optional / GPU-heavy artifacts are **not** required for baseline CPU tiers—see **`docs/stem-pipeline.md`** (**Ultra**) and **`docs/MODELS-INVENTORY.md`**.

---

## 3. Install dependencies on the server

**If production uses Docker Compose** (recommended for many EC2 setups): do **not** rely on host-only `npm`/`pip` for the live app — follow **[DEPLOY-DOCKER-EC2.md](DEPLOY-DOCKER-EC2.md)** (`docker compose build`, `up -d`, build times, conflict recovery). The following is the **bare-metal / multi-process** alternative (scripts or manual terminals):

Rough order (same as local multi-terminal setup):

1. **Python (stem service):** `python3 -m venv .venv`, `source .venv/bin/activate`, `pip install -r stem_service/requirements.txt`
2. **Backend:** `cd backend && npm ci` (Node 18+), configure `backend/.env` from `.env.example`
3. **Frontend:** set `frontend/.env` from `.env.example`, then `npm ci && npm run build`; serve `frontend/dist/` with nginx or similar

Use **`npm ci`**, not `npm install`, for reproducible deploys when `package-lock.json` is present.

---

## 4. Optional: `rsync` instead of a tarball

From your dev machine (repo root), push code without excluded paths:

```bash
rsync -avz --delete --exclude-from=scripts/deploy-exclude.txt \
  ./ ubuntu@YOUR_HOST:/opt/burntbeats/
```

`--delete` removes files on the server that were removed locally — use only if you understand it will delete extraneous files under that destination. Omit `--delete` for a safer first sync.

**Always** run `rsync` for `models/` separately (see section 2).

---

## Related

- **[DEPLOY-DOCKER-EC2.md](DEPLOY-DOCKER-EC2.md)** — if production uses **Docker Compose** on EC2, sync code then **`docker compose build`** / **`up -d`** (host **`npm run build`** alone may not update the served UI).
- **[DEPLOY-MARKETING-SITE.md](DEPLOY-MARKETING-SITE.md)** — standalone **`burnt-beats-pricing-structure/`** static site (full pricing URL); deploy **`dist/`** separately from the main SPA container.
- **`scripts/copy-models.sh`** — populate `models/` from your stem-models bank  
- Root **[README.md](../README.md)** — model list and CPU vs GPU  
- **[MALWARE-SCAN-OPS.md](MALWARE-SCAN-OPS.md)** — optional ClamAV after upload  
