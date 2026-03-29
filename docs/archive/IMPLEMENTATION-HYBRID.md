# Hybrid pipeline implementation

**Last updated:** 2025-03-09  
**Ref:** [AGENT-GUIDE-historical.md](AGENT-GUIDE-historical.md) (historical research; see [stem-pipeline.md](../stem-pipeline.md) for current behavior)

---

## Overview

The app implements the hybrid approach from the agent guide:

1. **Stage 1:** Extract vocals only (Demucs 2-stem; optional future: ONNX vocal model).
2. **Phase inversion:** Instrumental = Original − Vocals (Rust or Python).
3. **Stage 2:** Run Demucs 4-stem on the instrumental → drums, bass, other.

Result: vocals (Stage 1), drums, bass, other (Stage 2). Phase-perfect instrumental and cleaner “Other” stem.

- **Speed:** Demucs uses `--shifts 0`, `--overlap 0.25`, `--segment` per `stem_service/split.py` / config.
- **Optional VAD pre-trim:** `USE_VAD_PRETRIM=1` + `models/silero_vad.jit` + `silero-vad` pip → process only vocal span.
- **Optional ONNX Stage 1:** When e.g. `Kim_Vocal_2.onnx` is in `models/mdxnet_models/`, Stage 1 uses it (segment_size 256, overlap 2); else Demucs 2-stem.

---

## Components

| Layer | Role |
|-------|------|
| **Rust (`stem_api`)** | Legacy/orphaned Rust API. Not used by the current stack; orchestration is handled by Node backend + Python `stem_service/`. |
| **Python (`stem_service`)** | Stage 1: `vocal_stage1.py` (Demucs 2-stem). Stage 2: `split.run_demucs()` on instrumental. Phase inversion (Python path): `phase_inversion.py`. Pipeline: `hybrid.py` (CLI: `stage1`, `stage2`, `full`). |
| **FastAPI (`stem_service/server.py`)** | When `STEM_BACKEND=hybrid`, uses `run_hybrid_2stem` / `run_hybrid_4stem` (Python-only path: Stage1 + inversion + Stage2 in one process). |

---

## How to run

- **WSL + .venv** (required for Python models).

### Option A: Rust `stem_api` (deprecated; not used)

The Rust `stem_api/` implementation is legacy/orphaned. Current frontend traffic goes through the Node backend proxy to Python `stem_service/` FastAPI endpoints.

### Option B: Python-only (FastAPI hybrid)

1. From repo root (WSL):
   ```bash
   source .venv/bin/activate
   export STEM_BACKEND=hybrid
   bash scripts/run-stem-service.sh
   ```
   Or: `bash scripts/run-hybrid-python-only.sh`
2. API: `POST /split` (same contract as before).

### Demucs-only (legacy)

```bash
export STEM_BACKEND=demucs_only
bash scripts/run-stem-service.sh
```

---

## Env and paths

| Env | Meaning |
|-----|---------|
| `STEM_BACKEND` | `hybrid` (default) or `demucs_only` |
| `STEM_OUTPUT_DIR` | Where job dirs and stems are written (default: `{REPO}/tmp/stems`) |
| `REPO_ROOT` | Repo root (Rust API; default `.`) |
| `PYTHON` | Python binary for Rust subprocess (default `python3`) |

All model paths are under repo `models/` (no external links).

---

## Adding ONNX Stage 1 later

To use an ONNX vocal model (e.g. Kim_Vocal_2) for Stage 1 as in the guide:

1. Add a module under `stem_service/` that loads `models/mdxnet_models/*.onnx` (or similar) and runs MDX-style inference (segment_size 256, overlap 2).
2. In `vocal_stage1.py`, if that ONNX model is present, call it and write `vocals.wav`; else keep Demucs 2-stem.
3. No change to Rust or to the hybrid pipeline contract (Stage 1 still outputs one vocals file).
