# Model directories: layout & deployment

Single reference for **where weights live**, **which scripts mutate which trees**, and **what ships to EC2**. For file-by-file inventories see [`MODELS-INVENTORY.md`](MODELS-INVENTORY.md) and auto output [`MODEL-INVENTORY-AUTO.md`](MODEL-INVENTORY-AUTO.md).

---

## Two directories at repo root

| Directory | Purpose | Typical host | Git |
|-----------|---------|----------------|-----|
| **`models/`** | **Canonical workstation tree.** Everything `export_server_models.py` reads when building a deploy bundle. Populate with **`scripts/copy-models.sh`** from your upstream stem-models **bank** (that bank may be tens–100+ GiB — **never** upload it wholesale to production). | Dev machine (`D:\…\models`, WSL `/mnt/…/models`). May also mount on Compose for **local** runs. | Tracked selectively (weights often **gitignored**: see `.gitignore`); never assume it exists on CI. |
| **`server_models/`** | **Curated inference bundle** for Ubuntu / Compose. Produced by **`python scripts/export_server_models.py`**. Mirrors what **`stem_service`** actually needs at runtime when **`STEM_MODELS_DIR=server_models`**. | EC2 **`/home/ubuntu/burntbeats-aws/server_models`**, optionally same path on Windows for parity testing. | **Listed in `.gitignore`** — you maintain it per disk. |

Inference code resolves paths from **`stem_service/config.py`**:

```text
MODELS_DIR = REPO_ROOT / os.environ["STEM_MODELS_DIR"]   # default "models"
```

So **`STEM_MODELS_DIR=models`** ⇒ use **`./models`**; **`STEM_MODELS_DIR=server_models`** ⇒ use **`./server_models`** (POSIX in container: **`/repo/models`** vs **`/repo/server_models`**).

---

## Scripts (ordering)

```
stem-models bank ( huge, stays off prod )
           │
           │  STEM_MODELS_SOURCE=… bash scripts/copy-models.sh
           ▼
      ./models/          ← canonical; may still be large
           │
           │  python scripts/export_server_models.py
           │       (pins STEM_MODELS_DIR=models internally — see script docstring)
           ▼
   ./server_models/     ← rsync/scp/tar **only this** (or narrower) to EC2
```

- **`scripts/copy-models.sh`** — Copies a **bounded** subset into **`models/`** (Demucs cores, MDX dirs, ONNX lists, Silero ONNX, optional ORT aggregation). Comment header warns against treating the upstream bank as a deploy artifact.
- **`scripts/export_server_models.py`** — Walks **`config` / ONNX resolution** starting from **`models/`**, duplicates only required artifacts into **`server_models/`**. Do **not** run export expecting **`models/`** to be read from **`server_models/`**: the exporter **overrides `STEM_MODELS_DIR`** to the export source (`STEM_EXPORT_MODELS_DIR`, default **`models`**).

Related (Windows-heavy Demucs/th layout):

- **`scripts/sync_models_from_model_testing.ps1`** — Typed copies + rank-folder layout for Demucs ONNX/th; see [`MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md`](MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md).

---

## Docker Compose (`docker-compose.yml`)

Both trees are **bind-mounted** into **`stem_service`**:

```yaml
./tmp/stems:/repo/tmp/stems
./models:/repo/models
./server_models:/repo/server_models
```

**`environment.STEM_MODELS_DIR`** selects which subtree is active (**default `models`** in compose file). Production **`.env`** on EC2:

```bash
STEM_MODELS_DIR=server_models
```

The **`models`** mount may be empty on prod if you only ship **`server_models/`** — Docker creates an empty host dir when missing; inference still works as long as **`STEM_MODELS_DIR`** points at the mount that actually contains weights.

---

## Docker build context (`/.dockerignore`)

**`models/`** and **`server_models/`** are **excluded** from the **`stem_service` image context** (`Dockerfile` build context is repo root). Weights **must** arrive via **volume mounts** at **`docker compose up`**, not from image layers. Keeps builds fast and avoids shipping GiBs in registry.

---

## Quick EC2 checklist

1. **`git pull`** app repo (no gigantic model dirs in git).
2. **`rsync`/archive `server_models/`** from workstation after **`export_server_models.py`** (not the stem-models bank, not blindly all of **`models/`** unless you deliberately run that way).
3. Root **`.env`**: **`STEM_MODELS_DIR=server_models`**.
4. **`docker compose up -d`**, **`docker compose ps`** healthy.

Longer prose: **[`DEPLOY-DOCKER-EC2.md`](DEPLOY-DOCKER-EC2.md)** (§ Models), **[`DEPLOY-SERVER-BUNDLE.md`](DEPLOY-SERVER-BUNDLE.md)** §2.

---

## Related docs

| Doc | Contents |
|-----|----------|
| [README § Models layout](../README.md) | Short mental model duplicate for repo landing |
| [MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md](MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md) | Rank-28 speed lock, **`server_models`** path audit |
| [stem-pipeline.md](stem-pipeline.md) | What code does with ONNX / Demucs / SCNet at runtime |
| [stem_service/.env.example](../stem_service/.env.example) | **`STEM_MODELS_DIR`** and pipeline env |
