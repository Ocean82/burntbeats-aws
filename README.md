# Burnt Beats — Stem Splitter / Mixer / Master

Stem separation web app (CPU-only). Frontend: React + Vite (keyboard shortcuts, undo/redo, export options modal, mixer presets, onboarding tour, batch queue, A/B comparison). Backend: Node (Express). Stem engine: Python **hybrid pipeline** (Stage 1 vocals → phase inversion → Stage 2 Demucs on instrumental; optional Silero VAD pre-trim). Supports **three quality tiers**: Speed, Quality, and Ultra (Roformer models). Default backend: Demucs htdemucs for Stage 1 and Stage 2; ONNX vocal Stage 1 used when model present. **WSL only (Ubuntu)** — run everything inside WSL; same commands work on AWS EC2. No Windows-native commands or PowerShell.

**Last updated:** 2026-03-11

---

## Run (WSL / Ubuntu only)

All commands below are bash. Use a WSL (Ubuntu) terminal; the app is not supported running natively on Windows.

### 1. One-time setup

**Models (copies only, no symlinks):** Copy from your stem-models bank into `models/`.

| Project path | Source (WSL path to your stem-models dir) |
|--------------|------------------------------------------|
| `models/htdemucs.th` | **Recommended:** `python scripts/download_htdemucs_official.py` (official Facebook checkpoint). Or `stem-models/htdemucs.pth` via copy script (must be full-package format, not state_dict-only). |
| `models/MDX_Net_Models/` | `stem-models/MDX_Net_Models/` (incl. `model_data/`) |
| `models/mdxnet_models/` | `stem-models/all-uvr-models/mdxnet_models-onnx/` (Kim_Vocal_2.onnx, UVR-MDX-NET-Voc_FT.onnx, model_data.json, etc.) |
| `models/silero_vad.jit` | Optional: for VAD pre-trim (copy from your Silero VAD model location if you use `USE_VAD_PRETRIM=1`) |
| `models/Demucs_Models/` | Optional: for quality mode with Demucs Extra bag (mdx_extra_q.yaml + .th files) |
| `models/model_bs_roformer_*.ckpt` | Optional: for Ultra quality mode (Band-Split Roformer, see below) |
| `models/model_mel_band_roformer_*.ckpt` | Optional: for Ultra quality mode (best separation) |

### Ultra Quality Models (Optional)

For the premium "Ultra" quality option, add these models to `models/`:

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
The script looks for htdemucs at source root, then in `source/flow-models/` and `source/flow-models/demucs/ckpt/` (deep stem-models layout). For a known-good test run, prefer `python scripts/download_htdemucs_official.py` so `models/htdemucs.th` is the official format. See `docs/MODELS-INVENTORY.md` and `docs/MODELS-FLOW-MODELS-INVESTIGATION.md` for details.

**Python venv (from repo root):**
```bash
cd /path/to/burntbeats-aws   # e.g. /mnt/d/burntbeats-aws in WSL
python3 -m venv .venv
# Deps are installed by the run script on first start, or:
# source .venv/bin/activate && pip install -r stem_service/requirements.txt
```

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

Open the frontend URL shown in Terminal 3. Upload an audio file → choose 2 or 4 stems → **Split and Generate Stem Rack**. With all three services running, stems appear; use **Hear Stem**, **Download**, or **Load To Track**.

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

---

## Troubleshooting

**`Cannot find module @rollup/rollup-win32-x64-msvc` (Windows) or `@rollup/rollup-linux-x64-gnu` (WSL)**  
npm’s optional-deps handling can leave Rollup’s platform binary missing. The repo pins both in `frontend/package.json` optionalDependencies; a clean install usually fixes it.

- **Windows:** `cd frontend && npm install` (or `npm i @rollup/rollup-win32-x64-msvc --save-optional` if the main install skipped it).
- **WSL:** Close any process using the repo, then `cd frontend && rm -rf node_modules package-lock.json && npm i`. If `rm` fails on `/mnt/d/`, use a native Linux clone or run `npm i @rollup/rollup-linux-x64-gnu --save-optional` and retry the build.

**`NameError: name 'asynccontextmanager' is not defined` (stem_service)**  
Fixed in code: `stem_service/server.py` imports `asynccontextmanager` from `contextlib`. If you still see it, ensure you’re on the latest commit and that the venv uses the repo’s `stem_service/`.

---

## Env vars

| Where | Variable | Description |
|-------|----------|-------------|
| Backend | `PORT` | API port (default 3001) |
| Backend | `STEM_SERVICE_URL` | Python service URL (default http://localhost:5000) |
| Backend | `STEM_OUTPUT_DIR` | Dir for stem WAVs (default repo `tmp/stems`); must match Python |
| Python | `STEM_OUTPUT_DIR` | Same as backend so backend can serve files |
| Python | `USE_VAD_PRETRIM` | Set to `1` or `true` to pre-trim input to vocal span (Silero VAD) for faster separation; now enabled for both speed and quality modes |
| Python | `USE_GPU` | Set to `auto` (default), `1`, or `0`. Auto-detects CUDA GPU; falls back to CPU. On CPU-only servers, defaults to CPU. |
| Python | `STEM_BACKEND` | Set to `hybrid` (default) or `demucs_only` |
| Frontend | `VITE_API_BASE_URL` | Backend base URL (e.g. http://localhost:3001) |

---

## Quality Tiers

| Mode | Est. Time (3-min song) | Description |
|------|----------------------|-------------|
| **Speed** | ~2 min | VAD pre-trim + htdemucs (shifts=0, segment=10) |
| **Quality** | ~8 min | VAD + ONNX/Demucs Extra (shifts=3, segment=7) |
| **Ultra** | ~20-90 min | Roformer models (best separation) |

### Optimizations Applied

- **VAD pre-trim**: Now enabled for both speed AND quality modes (reduces processing by 20-40%)
- **Skip phase inversion**: When Demucs 2-stem is used, instrumental is already available (faster)
- **Larger segments**: Speed mode uses segment=10, quality uses segment=7
- **GPU auto-detect**: Automatically uses CUDA if available (5-10x faster on GPU)

---

## API

- **POST /api/stems/split** — `multipart/form-data`: `file`, `stems` = "2" or "4", optional `quality` = "speed", "quality" (default), or "ultra". Returns `{ job_id, status, stems: [{ id, url }] }`.
- **GET /api/stems/file/:job_id/:stemId.wav** — Stream stem WAV (e.g. `vocals.wav`, `instrumental.wav`).

---

## Deploy (AWS Ubuntu)

On the EC2 instance (Ubuntu), use the same bash scripts.

- **Stem service:** `bash scripts/run-stem-service.sh` (e.g. under systemd or screen).
- **Backend:** `bash scripts/run-backend.sh` (same host so `STEM_OUTPUT_DIR` is shared).
- **Frontend:** Build once: `cd frontend && npm install && npm run build`. Set `VITE_API_BASE_URL` to your public backend URL (e.g. `https://api.yourdomain.com`) before building. Serve `frontend/dist/` with nginx or another static server.
- Optionally point `STEM_OUTPUT_DIR` to an S3-mounted path and serve stem files via presigned URLs (you add AWS env when ready).
- RDS: not required for stem splitting; add when you need users/jobs metadata.

See `docs/` for agent knowledge and model policy. **Sanity checks:** `docs/SANITY-CHECKS.md` — large upload, back-to-back splits, instrumental quality, waveform/trim/export, export WAV correctness.
