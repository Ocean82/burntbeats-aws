# Burnt Beats — Stem Splitter / Mixer / Master

Stem separation web app (CPU-only). **Flow:** Split a track (2-stem: vocals + instrumental first) or **load stems** from other projects to mix. After 2-stem split, optionally **Keep going → 4 stems** (drums, bass, other). Mixer: trim, level, pan, **pitch** (semitones), **time stretch**, export master or stems. Frontend: React + Vite (keyboard shortcuts, undo/redo, export modal, mixer presets, onboarding, batch queue, A/B comparison). Backend: Node (Express). Stem engine: Python **hybrid pipeline** (Stage 0 Silero VAD → Stage 1 MDX ONNX vocal → phase inversion → Stage 2 Demucs on instrumental). **CPU-optimal:** Stage 1 MDX ONNX (Kim_Vocal_2 / Voc_FT); Demucs ONNX or subprocess for 4-stem. **Quality tiers:** Speed, Quality (default), Ultra (RoFormer; GPU-only in practice). **WSL only (Ubuntu)** — run inside WSL; same commands on AWS EC2.

**Last updated:** 2026-03-17

---

## Run (WSL / Ubuntu only)

All commands below are bash. Use a WSL (Ubuntu) terminal; the app is not supported running natively on Windows.

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
| Backend | `STEM_OUTPUT_DIR` | Dir for stem WAVs (default repo `tmp/stems`); must match Python |
| Backend | `SPLIT_ACCEPT_TIMEOUT_MS` | Ms to wait for stem service to accept (default 300000 = 5 min) |
| Backend | `FRONTEND_ORIGINS` | CORS origins, comma-separated (default includes 5173, 5174) |
| Python | `STEM_OUTPUT_DIR` | Same as backend so backend can serve files |
| Python | `USE_VAD_PRETRIM` | Set to `1` or `true` to pre-trim to first–last speech (faster when there’s silence; stems are **shorter**). Set to `0` for **full-length** stems. See `docs/VAD-PRETRIM-TRADEOFF.md`. |
| Python | `USE_GPU` | Set to `auto` (default), `1`, or `0`. Auto-detects CUDA GPU; falls back to CPU. On CPU-only servers, defaults to CPU. |
| Python | `USE_ULTRA_ON_CPU` | Set to `1` to allow Ultra (RoFormer) on CPU (slow; not recommended). Default: Ultra is disabled on CPU and falls back to Quality. |
| Python | `STEM_BACKEND` | Set to `hybrid` (default) or `demucs_only` |
| Python | `OMP_NUM_THREADS` | OpenMP threads for PyTorch/Demucs (default: `nproc`). Set to physical cores to avoid oversubscription. |
| Python | `MKL_NUM_THREADS` | MKL threads when used (default: same as `OMP_NUM_THREADS`). |
| Python | `ONNXRUNTIME_NUM_THREADS` | ONNX Runtime intra-op threads (default: 0 = physical cores with affinity). Set to a number to override. |
| Python | `USE_ONNX_CPU` | Set to `1` to force CPU for all ONNX models (MDX + Demucs ONNX). Default: use CUDA when available (`pip install onnxruntime-gpu`). |
| Python | `USE_INT8_ONNX` | Set to `0` to disable int8 MDX models (use float32 only). Default: use `.quant.onnx` when present (see `docs/QUANTIZATION-8BIT.md`). |
| Python | `USE_DEMUCS_SHIFTS_0` | Default `1`: Demucs uses shifts=0 (faster on CPU). Set to `0` to use 3 shifts in Quality. See `docs/CPU-OPTIMIZATION-TIPS.md`. |
| Python | `DEMUCS_QUALITY_BAG` | `mdx_extra_q` (default, lighter) or `mdx_extra` (heavier, slower, best quality). |
| Frontend | `VITE_API_BASE_URL` | Backend base URL (e.g. http://localhost:3001) |

---

## Quality Tiers

| Mode | Est. Time (3-min song) | Description |
|------|----------------------|-------------|
| **Speed** | Fast | VAD + **MDX ONNX (Kim_Vocal_2)** Stage 1 when available, else Demucs 2-stem; Stage 2 Demucs (shifts=0, segment=7). |
| **Quality** | ~2–5× faster than before | VAD + MDX ONNX Stage 1 + Demucs Stage 2 (default; CPU-optimal). Quality bag: mdx_extra_q or mdx_extra. |
| **Ultra** | GPU only | RoFormer/MDX23C; on CPU falls back to Quality automatically |

### Optimizations Applied

- **VAD pre-trim**: Now enabled for both speed AND quality modes (reduces processing by 20-40%)
- **Skip phase inversion**: When Demucs 2-stem is used, instrumental is already available (faster)
- **Larger segments**: Speed mode uses segment=7, quality uses segment=7
- **GPU auto-detect**: Automatically uses CUDA if available (5-10x faster on GPU)
- **ONNX engines**: MDX and Demucs ONNX use `get_onnx_providers()`: CUDA when available (install `onnxruntime-gpu`), else CPU. Set `USE_ONNX_CPU=1` to force CPU. Graph optimization `ORT_ENABLE_ALL` and `ONNXRUNTIME_NUM_THREADS` apply to both.
- **CPU threading**: `run-stem-service.sh` sets `OMP_NUM_THREADS`/`MKL_NUM_THREADS` to `nproc` so ONNX and Demucs don’t oversubscribe.
- **Shifts=0**: Demucs runs with `--shifts 0` by default on CPU (set `USE_DEMUCS_SHIFTS_0=0` to use 3 shifts for Quality). **Light ensemble**: Quality defaults to `mdx_extra_q`; set `DEMUCS_QUALITY_BAG=mdx_extra` for the heavy bag. See `docs/CPU-OPTIMIZATION-TIPS.md`.
- **CPU-only PyTorch (optional)**: On a machine with no GPU, `pip install torch --index-url https://download.pytorch.org/whl/cpu` keeps the stem service CPU-only and can reduce install size; the default `pip install -r stem_service/requirements.txt` is fine otherwise.

---

## API

- **POST /api/stems/split** — `multipart/form-data`: `file`, `stems` = "2" (default; vocals + instrumental), optional `quality` = "speed", "quality", or "ultra". Returns `{ job_id, status }` (202); poll status for stems.
- **POST /api/stems/expand** — Body: `job_id` (2-stem job), optional `quality`. Expands to 4 stems (vocals + drums, bass, other). Returns new `job_id` (202); poll status for stems.
- **GET /api/stems/status/:job_id** — Job progress and final `stems: [{ id, url }]`.
- **GET /api/stems/file/:job_id/:stemId.wav** — Stream stem WAV.

---

## Deploy (AWS Ubuntu)

On the EC2 instance (Ubuntu), use the same bash scripts.

- **Stem service:** `bash scripts/run-stem-service.sh` (e.g. under systemd or screen).
- **Backend:** `bash scripts/run-backend.sh` (same host so `STEM_OUTPUT_DIR` is shared).
- **Frontend:** Build once: `cd frontend && npm install && npm run build`. Set `VITE_API_BASE_URL` to your public backend URL (e.g. `https://api.yourdomain.com`) before building. Serve `frontend/dist/` with nginx or another static server.
- Optionally point `STEM_OUTPUT_DIR` to an S3-mounted path and serve stem files via presigned URLs (you add AWS env when ready).
- RDS: not required for stem splitting; add when you need users/jobs metadata.

See `docs/` for agent knowledge and model policy. **Sanity checks:** `docs/SANITY-CHECKS.md` — large upload, back-to-back splits, instrumental quality, waveform/trim/export, export WAV correctness.
