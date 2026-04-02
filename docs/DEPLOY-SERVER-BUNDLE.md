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

## 2. Models (separate step — only what you need)

The bundle **does not** include `models/`. On **CPU-only** production (typical `t3.large`), you need at least:

- **Demucs:** `htdemucs.pth` or `htdemucs.th` (see root README / `scripts/download_htdemucs_official.py`)
- **Hybrid / MDX:** contents under `models/MDX_Net_Models/` and `models/mdxnet_models/` as produced by **`scripts/copy-models.sh`** from your stem-models bank

**Option A — on the server, copy from a mounted path or USB:**

```bash
mkdir -p models
STEM_MODELS_SOURCE=/path/to/stem-models bash scripts/copy-models.sh
```

**Option B — rsync only `models/` from your dev machine** (after you’ve already run `copy-models.sh` locally so `models/` is minimal):

```bash
rsync -avz --progress ./models/ ubuntu@YOUR_HOST:/opt/burntbeats/models/
```

Do **not** sync your entire multi-hundred-GB stem-models bank unless you intend to; use `copy-models.sh` locally or on the server so only required files land under `models/`.

Optional / GPU-only items (RoFormer `.ckpt`, etc.) are **not** required for CPU-only; see root README *Ultra Quality Models*.

---

## 3. Install dependencies on the server

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
- **`scripts/copy-models.sh`** — populate `models/` from your stem-models bank  
- Root **[README.md](../README.md)** — model list and CPU vs GPU  
- **[MALWARE-SCAN-OPS.md](MALWARE-SCAN-OPS.md)** — optional ClamAV after upload  
