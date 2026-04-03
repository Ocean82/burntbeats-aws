# Burnt Beats — Stem Splitter / Mixer / Master

**Documentation:** [docs/README.md](docs/README.md) (full index) · [docs/stem-pipeline.md](docs/stem-pipeline.md) (separation pipeline) · [docs/BILLING-AND-TOKENS.md](docs/BILLING-AND-TOKENS.md) (Stripe plans, tokens, Basic vs Premium) · [docs/MODEL-SELECTION-AUTHORITY.md](docs/MODEL-SELECTION-AUTHORITY.md) (**model selection — read before changing models**) · [docs/ranked_practical_time_score.csv](docs/ranked_practical_time_score.csv) (score + time benchmark table)

Stem separation web app (**CPU-first; no GPU required**). **Flow:** Split a track (2-stem: vocals + instrumental first) or **load stems** from other projects to mix. After 2-stem split, optionally **Keep going → 4 stems** (drums, bass, other). Mixer: trim, level, pan, **pitch** (semitones), **time stretch**, export master or stems. Frontend: React + Vite. Backend: Node (Express). Stem engine: Python (**hybrid** + ONNX + optional Demucs subprocess). **Quality tiers:** Speed, Quality (default), Ultra — see [docs/stem-pipeline.md](docs/stem-pipeline.md) for exact routing.

**Last updated:** 2026-03-22

---

## ⚠️ Model selection — read before touching mdx_onnx.py

**Full authority doc: [docs/MODEL-SELECTION-AUTHORITY.md](docs/MODEL-SELECTION-AUTHORITY.md)**

Model tier assignments are derived from benchmarks run 2026-03-22. The rules are:

- **Minimum quality score: 8.5.** Models below this are banned from all tiers. This includes `kuielab_a/b` (8.0). Legacy Demucs **ONNX** exports (`htdemucs_6s`, `htdemucs_embedded`, `demucsv4`) scored 1–2/10 in benchmarks and are **not** used by the service; 4-stem uses **PyTorch** Demucs. `Reverb_HQ_By_FoxJoy` is scored 1 for wrong role in 2-stem vocal benchmarks but kept for ultra dereverb.
- **ORT is preferred over ONNX** — `.ort` siblings are 5–10% faster and auto-selected at runtime by `resolve_mdx_model_path()`. Tier lists use `.onnx` names; ORT resolution is automatic.
- **fast tier** = ranked by blended score (quality×0.8 + speed×0.2), fastest first.
- **quality tier** = ranked by raw quality score descending.
- **`UVR_MDXNET_KARA_2` and `Kim_Inst` are instrumental models** despite being labeled vocal in UVR — use only for inst separation.
- **Demucs ONNX is not in the runtime** — 4-stem uses **PyTorch** (`htdemucs.pth` / `.th`) after optional SCNet; see [docs/stem-pipeline.md](docs/stem-pipeline.md).

Current approved tiers (from `stem_service/mdx_onnx.py`):

| Tier | Vocal | Instrumental |
|------|-------|-------------|
| fast #1 | `UVR_MDXNET_3_9662` (blended 0.883, speed 0.816) | `UVR-MDX-NET-Inst_HQ_5` (blended 0.801, speed 0.406) |
| fast #2 | `UVR_MDXNET_KARA` (blended 0.877, speed 0.784) | — only one inst model qualifies for fast |
| quality #1 | `UVR_MDXNET_3_9662` (highest blended eligible) | `UVR-MDX-NET-Inst_HQ_5` (blended 0.801) |
| quality #2 | `Kim_Vocal_1` (quality 0.90, blended 0.787) | `UVR-MDX-NET-Inst_HQ_4` (blended 0.788) |

---

## Target environment (read this first)

| | |
|--|--|
| **Production server** | **AWS EC2 `t3.large`** (2 vCPU / 8 GiB) running **Ubuntu**, **CPU only** — **no GPU**. The separation stack is designed and benchmarked for this profile ([`scripts/t3-large-benchmark.sh`](scripts/t3-large-benchmark.sh)). Use `USE_GPU=0` and typically `USE_ONNX_CPU=1` so all inference stays on the CPU. |
| **Local development** | **WSL** with an **Ubuntu** distro so Bash paths and behavior match the server. Run all `scripts/*.sh` from a WSL terminal, not from PowerShell/CMD. |
| **Python venv** | Create once at the repo root: `python3 -m venv .venv`. **Whenever you work in that environment**, activate it with **`source .venv/bin/activate`** (WSL/Ubuntu). Then `pip install …` and `python` use the project interpreter. |

Docker Compose is optional for full-stack runs; native Windows is not the primary path — prefer **WSL Ubuntu** or the Linux server.

---

## Run (WSL / Ubuntu)

All commands below are **bash**. Use a **WSL (Ubuntu)** terminal on Windows, or a native **Ubuntu** shell on your server; the app is not documented for native Windows shells.

### 1. One-time setup

**Models (copies only, no symlinks):** Copy from your stem-models bank into `models/`.

| Project path | Source (WSL path to your stem-models dir) |
|--------------|------------------------------------------|
| `models/htdemucs.th` | **Recommended on CPU:** Prefer `.th` (smaller, faster). `python scripts/download_htdemucs_official.py` or copy `stem-models/htdemucs.pth` (app creates `.th` from `.pth` if needed). Used as optional Stage 2/3, not default Stage 1. |
| `models/MDX_Net_Models/` | `stem-models/MDX_Net_Models/` (incl. `model_data/`) |
| `models/mdxnet_models/` | `stem-models/all-uvr-models/mdxnet_models-onnx/` (Kim_Vocal_2.onnx, UVR-MDX-NET-Voc_FT.onnx, model_data.json, etc.) |
| `models/silero_vad.onnx` | Optional: for VAD pre-trim (Silero VAD ONNX; use if `USE_VAD_PRETRIM=1`. Copy from Silero/vadslice or export from .jit.) |
| `models/Demucs_Models/` | Optional: for quality mode with Demucs Extra bag (mdx_extra_q.yaml + .th files) |
| `models/model_bs_roformer_*.ckpt` | Optional: Ultra mode **GPU only** (on CPU, Ultra falls back to Quality) |
| `models/model_mel_band_roformer_*.ckpt` | Optional: Ultra mode **GPU only** (best separation) |

### Ultra Quality Models (Optional, GPU only)

On **CPU-only** hosts, the "Ultra" tier is disabled and the pipeline uses Quality (MDX ONNX + Demucs) instead. RoFormer and MDX23C `.ckpt` models are very slow on CPU with no quality gain over MDX ONNX. HP2-3090 4-band models are not used in the CPU pipeline.

For the premium "Ultra" quality option **when using a GPU**, add these models to `models/`:

| Model | Size | Quality |
|-------|------|---------|
| `model_bs_roformer_ep_317_sdr_12.9755.ckpt` | ~610 MB | Excellent |
| `model_bs_roformer_ep_937_sdr_10.5309.ckpt` | ~375 MB | Very Good |
| `model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt` | ~961 MB | Best |

Place in `models/MDX_Net_Models/` or `models/` root.

**Copy script (from repo root in WSL):**
```bash
# If your stem-models live on Windows D: drive, use the WSL path:
STEM_MODELS_SOURCE="/mnt/d/DAW Collection/stem-models" bash scripts/copy-models.sh

# Or pass the path as the first argument:
bash scripts/copy-models.sh "/mnt/d/DAW Collection/stem-models"
```
The script looks for htdemucs at source root, then in `source/flow-models/` and `source/flow-models/demucs/ckpt/` (deep stem-models layout). For a known-good test run, prefer `python scripts/download_htdemucs_official.py` so `models/htdemucs.th` is the official format. See `docs/MODELS-INVENTORY.md` for details.

**Python venv (from repo root, WSL/Ubuntu):**
```bash
cd /path/to/burntbeats-aws   # e.g. /mnt/d/burntbeats-aws in WSL
python3 -m venv .venv
source .venv/bin/activate    # use this every session before pip/python
pip install -r stem_service/requirements.txt   # if not using run-stem-service.sh auto-install
```
The stem run scripts may install deps on first start; manual work on the stem service should always use **`source .venv/bin/activate`** first.

**Frontend .env:** Ensure `frontend/.env` has `VITE_API_BASE_URL=http://localhost:3001` (or your backend URL). Copy from `frontend/.env.example` if needed.

### 2. Run locally (localhost)

**Option A — One command (WSL):** From repo root, run one script; it starts stem + backend in the background and frontend in the foreground. Ctrl+C stops all.
```bash
bash scripts/run-all-local.sh
```
Then open **http://localhost:5173** in your browser.

**Option B — Three terminals:** Run each service in its own terminal (useful for separate logs).

All scripts live in `scripts/` and assume you run them from the **repo root** (they `cd` to repo root automatically). Same commands on WSL and on AWS Ubuntu.

**Terminal 1 — Stem service (port 5000):**
```bash
cd /path/to/burntbeats-aws
bash scripts/run-stem-service.sh
```
Installs Python deps on first run if needed, then starts the stem service.

**Terminal 2 — Backend (port 3001):**
```bash
cd /path/to/burntbeats-aws
bash scripts/run-backend.sh
```
Installs Node deps on first run if needed.

**Terminal 3 — Frontend (Vite dev, e.g. port 5173):**
```bash
cd /path/to/burntbeats-aws
bash scripts/run-frontend.sh
```
Creates `.env` from example if missing; installs Node deps on first run if needed.

Open the frontend URL shown in Terminal 3. **Split a track:** upload → choose quality → **Split** (2-stem: vocals + instrumental). Then **Keep going → 4 stems** or use the mixer. **Load stems:** use “Load stems (mashup)” to add WAV/MP3 files as mixer tracks. Use **Hear**, **Play mix**, **Export**.

If you see `ERR_CONNECTION_REFUSED` on `/api/stems/split`, start the backend (Terminal 2) and ensure `VITE_API_BASE_URL` in `frontend/.env` matches the backend port (default 3001). If you see **502 Bad Gateway** on `/api/stems/split`, the backend is up but the stem service (port 5000) is not — start Terminal 1 (`bash scripts/run-stem-service.sh`) first.

### Verify models (segment tests)

From repo root (WSL), run:

```bash
bash scripts/check-segments.sh
```

This creates a short test WAV in `tmp/segment_test/` and runs each pipeline segment (VAD, phase inversion, Stage 1 vocal extraction, Stage 2 Demucs 4-stem) so you can confirm models load and run correctly.

### Test 2-stem and 4-stem splitting (sound quality)

From repo root (WSL), run:

```bash
bash scripts/test-stem-splits.sh
```

This runs the full pipeline for **2-stem** and **4-stem** in both **quality** and **speed** modes, then checks that output stems exist, are valid WAVs, have sane duration, and are non-silent. Stems are written to `tmp/stem_split_test/` so you can listen to them to confirm sound quality is acceptable.

### t3.large benchmark workflow (CPU-only)

To validate speed/quality on an AWS t3.large profile and generate model ranking output:

```bash
bash scripts/t3-large-benchmark.sh /path/to/your-song.wav
```

This workflow runs:
- quality regression checks (`scripts/test_stem_splits.py`)
- benchmark matrix (`scripts/run_model_benchmark.py`)
- ranking report generation (`scripts/generate_model_ranking.py`)

The ranking report now includes an automatic **Recommended defaults** table for:
- `2_stem_speed`
- `2_stem_quality`
- `4_stem_speed`
- `4_stem_quality`

You can tune recommendation thresholds:

```bash
python scripts/generate_model_ranking.py \
  --max-rtf-2-speed 1.4 \
  --max-rtf-2-quality 2.8 \
  --max-rtf-4-speed 2.2 \
  --max-rtf-4-quality 4.5
```

Outputs:
- benchmark artifacts: `benchmark_out_*`
- ranking report: `tmp/model_ranking_report.md`

---

## Troubleshooting

**`Cannot find module @rollup/rollup-win32-x64-msvc` (Windows) or `@rollup/rollup-linux-x64-gnu` (WSL)**  
npm’s optional-deps handling can leave Rollup’s platform binary missing. The repo pins both in `frontend/package.json` optionalDependencies; a clean install usually fixes it.

- **Windows:** `cd frontend && npm install` (or `npm i @rollup/rollup-win32-x64-msvc --save-optional` if the main install skipped it).
- **WSL:** Close any process using the repo, then `cd frontend && rm -rf node_modules package-lock.json && npm i`. If `rm` fails on `/mnt/d/`, use a native Linux clone or run `npm i @rollup/rollup-linux-x64-gnu --save-optional` and retry the build.

**`NameError: name 'asynccontextmanager' is not defined` (stem_service)**  
Fixed in code: `stem_service/server.py` imports `asynccontextmanager` from `contextlib`. If you still see it, ensure you’re on the latest commit and that the venv uses the repo’s `stem_service/`.

**Split times out or no stems rendered**  
- **Models required:** Stem splitting needs at least `models/htdemucs.th` (or `htdemucs.pth`). Run `bash scripts/check-models.sh` from repo root; if it fails, run `python scripts/download_htdemucs_official.py` to download the official Demucs checkpoint into `models/`.
- **Accept timeout:** The backend waits up to 5 minutes for the stem service to accept the upload (return 202). For large files or slow disk, increase `SPLIT_ACCEPT_TIMEOUT_MS` (e.g. 600000 for 10 min) in backend env or `backend/.env`.
- **Polling:** The frontend polls for up to 16 minutes for job completion. CPU separation can take several minutes per track; use **Speed** quality for faster results.

---

## Env vars

| Where | Variable | Description |
|-------|----------|-------------|
| Backend | `PORT` | API port (default 3001). Set in `backend/.env` for server (e.g. 8001 to match security group). |
| Backend | `STEM_SERVICE_URL` | Python service URL (default http://127.0.0.1:5000) |
| Python | `STEM_SERVICE_HOST` | Bind host for stem service (default `127.0.0.1`). Keep localhost-only in production; do not expose port `5000` publicly. |
| Backend/ Python | `STEM_SERVICE_INTERNAL_TOKEN` | Optional shared secret for Node→Python requests. When set, Node sends `x-internal-token`; the stem service rejects requests without the header. |
| Backend | `JOB_TOKEN_TTL_MS` | Job token lifetime in milliseconds (default `21600000`, 6 hours). |
| Backend | `JOB_TOKEN_SECRET` | Primary HMAC secret used to sign newly issued job tokens. |
| Backend | `JOB_TOKEN_SECRET_PREVIOUS` | Optional previous HMAC secret accepted for validation during secret rotation windows. |
| Backend | `STEM_OUTPUT_DIR` | Dir for stem WAVs (default repo `tmp/stems`); must match Python |
| Backend | `SPLIT_ACCEPT_TIMEOUT_MS` | Ms to wait for stem service to accept (default 300000 = 5 min) |
| Backend | `FRONTEND_ORIGINS` | CORS origins, comma-separated (default includes 5173, 5174) |
| Python | `STEM_OUTPUT_DIR` | Same as backend so backend can serve files |
| Python | `USE_VAD_PRETRIM` | Set to `1` or `true` to pre-trim to first–last speech (faster when there’s silence; stems are **shorter**). Set to `0` for **full-length** stems. See `docs/archive/VAD-PRETRIM-TRADEOFF.md`. |
| Python | `USE_GPU` | Set to `auto` (default), `1`, or `0`. Auto-detects CUDA GPU; falls back to CPU. On CPU-only servers, defaults to CPU. |
| Python | `USE_ULTRA_ON_CPU` | Set to `1` to allow Ultra (RoFormer) on CPU (slow; not recommended). Default: Ultra is disabled on CPU and falls back to Quality. |
| Python | `STEM_BACKEND` | Set to `hybrid` (default) or `demucs_only` |
| Python | `OMP_NUM_THREADS` | OpenMP threads for PyTorch/Demucs (default: `nproc`). Set to physical cores to avoid oversubscription. |
| Python | `MKL_NUM_THREADS` | MKL threads when used (default: same as `OMP_NUM_THREADS`). |
| Python | `ONNXRUNTIME_NUM_THREADS` | ONNX Runtime intra-op threads (default: 0 = physical cores with affinity). Set to a number to override. |
| Python | `USE_ONNX_CPU` | Set to `1` to force CPU for all ONNX models (MDX + Demucs ONNX). Default: use CUDA when available (`pip install onnxruntime-gpu`). |
| Python | `USE_INT8_ONNX` | Set to `0` to disable int8 MDX models (use float32 only). Default: use `.quant.onnx` when present (see `docs/archive/QUANTIZATION-8BIT.md`). |
| Python | `USE_DEMUCS_SHIFTS_0` | Default `1`: Demucs uses shifts=0 (faster on CPU). Set to `0` to use 3 shifts in Quality. See `docs/CPU-OPTIMIZATION-TIPS.md`. |
| Python | `DEMUCS_QUALITY_BAG` | `mdx_extra_q` (default, lighter) or `mdx_extra` (heavier, slower, best quality). 4-stem quality requires the `diffq` package (included in `stem_service/requirements.txt`). |
| Frontend | `VITE_API_BASE_URL` | Backend base URL (e.g. http://localhost:3001) |
| Backend | `MALWARE_SCAN_ENABLED`, `CLAMSCAN_BIN`, … | Optional ClamAV scan on temp upload before split; see [docs/MALWARE-SCAN-OPS.md](docs/MALWARE-SCAN-OPS.md) |

### Production env contract

The app uses two layers of protection for production deployments:

1. Node gateway auth (optional)
   - Set `API_KEY` (backend) and `VITE_API_KEY` (frontend) to require `x-api-key` for `POST /api/stems/split`.

2. Per-job access tokens (recommended)
   - Set `JOB_TOKEN_SECRET` (backend) so the backend issues short-lived `access_token` values.
   - The frontend automatically attaches `access_token` to:
     - `GET /api/stems/status/:job_id` via header `x-job-token`
     - stem audio URLs via query param `?token=...`
     - `POST /api/stems/expand` and `DELETE /api/stems/:job_id` via header `x-job-token`
   - If `JOB_TOKEN_SECRET` is unset/empty, token enforcement is disabled for local development.

3. Stem-service protection (recommended)
   - Set `STEM_SERVICE_API_TOKEN` (Node + Python) so `stem_service` rejects unauthenticated requests when port `5000` is reachable outside your trusted network.
   - `stem_service` expects header `X-Stem-Service-Token`.

4. Malware scan after upload (optional)
   - Install ClamAV on the backend host, run `freshclam`, optionally enable `clamd` and use `clamdscan`.
   - Set `MALWARE_SCAN_ENABLED=1` and `CLAMSCAN_BIN` in `backend/.env`. See **[docs/MALWARE-SCAN-OPS.md](docs/MALWARE-SCAN-OPS.md)** for the full checklist.

Operational settings
- Rate limiting: optionally set `RATE_LIMIT_REDIS_URL` to enable Redis-backed rate limits; otherwise the backend falls back to in-memory.
- Expand accept timeout: optionally set `EXPAND_ACCEPT_TIMEOUT_MS` (defaults to `SPLIT_ACCEPT_TIMEOUT_MS`).

---

## Quality tiers and pipeline

Summary:

| Mode | Intent |
|------|--------|
| **Speed** | Fastest: optional VAD trim, lower MDX overlap, faster 4-stem ONNX strides where applicable. |
| **Quality** | Default: full-length input, higher MDX overlap, tighter 4-stem windowing on embedded ONNX; see code. |
| **Ultra** | Best-quality checkpoints (e.g. RoFormer) via `audio-separator`; slow on CPU unless you opt in. |

**Detailed routing** (2-stem → expand, model order, fallbacks): **[docs/stem-pipeline.md](docs/stem-pipeline.md)**.

---

## API

- **POST /api/stems/split** — `multipart/form-data`: `file`, `stems` = "2" (default; vocals + instrumental), optional `quality` = "speed", "quality", or "ultra". Returns `{ job_id, status }` (202); poll status for stems.
- **POST /api/stems/expand** — Body: `job_id` (2-stem job), optional `quality`. Expands to 4 stems (vocals + drums, bass, other). Returns new `job_id` (202); poll status for stems.
- **GET /api/stems/status/:job_id** — Job progress and final `stems: [{ id, url }]`.
- **GET /api/stems/file/:job_id/:stemId.wav** — Stream stem WAV.

---

## Deploy (AWS Ubuntu, t3.large CPU-only)

Production is expected to match **Ubuntu** on an instance such as **`t3.large`**: **CPU only, no GPU**. Keep separation on CPU (`USE_GPU=0`, `USE_ONNX_CPU=1` as appropriate) unless you deliberately add a GPU instance later.

**Packaging for upload:** To copy the app to the server **without** your full local `models/`, `node_modules/`, or `.venv/`, run **`bash scripts/package-server-bundle.sh`** (creates `tmp/deploy/burntbeats-server-*.tgz`) and follow **[docs/DEPLOY-SERVER-BUNDLE.md](docs/DEPLOY-SERVER-BUNDLE.md)** for `scp`, extracting, and syncing only the model files you need.

**Docker Compose on EC2:** If production runs **`docker compose`** (root **`docker-compose.yml`**), use **[docs/DEPLOY-DOCKER-EC2.md](docs/DEPLOY-DOCKER-EC2.md)** for **`git pull`**, **`docker compose build` / `up -d`**, per-service rebuilds, **expected build duration** (especially **`stem_service`**), **container name conflict** recovery (**`compose down` / `up`**), and how host nginx relates to the **frontend** container.

**Marketing “full pricing” page** (`burnt-beats-pricing-structure/`, linked as **`VITE_FULL_PRICING_URL`** / www pricing): **not** built by Compose. Build and deploy that static site separately — **[docs/DEPLOY-MARKETING-SITE.md](docs/DEPLOY-MARKETING-SITE.md)**.

On the EC2 instance, use the same bash scripts as in WSL.

- **Stem service:** `bash scripts/run-stem-service.sh` (e.g. under systemd or screen). Activate the venv if you run Python manually: `source .venv/bin/activate`.
- **Backend:** `bash scripts/run-backend.sh` (same host so `STEM_OUTPUT_DIR` is shared).
- The stem service is intended to be reachable only from the backend host (binds to localhost by default); restrict inbound to port `5000` at the network layer.
- **Frontend:** Build once: `cd frontend && npm install && npm run build`. Set `VITE_API_BASE_URL` to your public backend URL (e.g. `https://api.yourdomain.com`) before building. Serve `frontend/dist/` with nginx or another static server.
- Optionally point `STEM_OUTPUT_DIR` to an S3-mounted path and serve stem files via presigned URLs (you add AWS env when ready).
- RDS: not required for stem splitting; add when you need users/jobs metadata.

See **[docs/README.md](docs/README.md)** for the full doc map. **Sanity checks:** [docs/SANITY-CHECKS.md](docs/SANITY-CHECKS.md).
