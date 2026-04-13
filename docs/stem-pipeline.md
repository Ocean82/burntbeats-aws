# Stem separation pipeline (canonical)

This document describes the **implemented** behavior in `stem_service/`. For installation, scripts, deployment, and the **t3.large CPU-only / WSL Ubuntu / `source .venv/bin/activate`** setup, use the root [README.md](../README.md) (*Target environment*).

## Product flow

1. **Split** — Always starts as **2-stem** (vocals + instrumental) unless the user requests **4-stem** directly via API (`stems=4`).
2. **Expand** — From a completed 2-stem job, **Keep going → 4 stems** runs separation on the **instrumental** only (vocals copied), producing drums, bass, other.
3. **Load stems** — Users can load external WAV/MP3 files as mixer tracks (no separation).

## Quality tiers (`quality` form field / JSON)

| Value | Intent | Typical behavior |
|--------|--------|------------------|
| **speed** | Fastest turnaround | VAD pre-trim when `USE_VAD_PRETRIM`; MDX chunk overlap 50%; coarser sliding-window stride on SCNet where applicable. |
| **quality** | Default: balance of quality and time | Full-length processing; MDX overlap 75%; tighter window stride on SCNet; hybrid fallback unchanged. |
| **ultra** | Maximum separation (premium) | RoFormer / large checkpoints via `audio-separator`; requires extra deps; very slow on CPU unless explicitly allowed. |

Exact routing is in `stem_service/server.py` → `stem_service/hybrid.py`, `vocal_stage1.py`, `mdx_onnx.py`, `scnet_onnx.py`, `split.py`, `ultra.py`.

## `STEM_BACKEND` (`hybrid` vs `demucs_only`)

| Mode | 2-stem | 4-stem |
|------|--------|--------|
| **`hybrid`** (default) | `run_hybrid_2stem` → `extract_vocals_stage1` (ONNX waterfall, `InstrumentalSource`, optional phase inversion) | `run_4stem_single_pass_or_hybrid` (SCNet / hybrid Demucs, etc.) |
| **`demucs_only`** | `run_demucs_only_2stem` → PyTorch `htdemucs` `--two-stems=vocals` only (no MDX ONNX Stage 1) | `run_demucs` 4-stem only |

Unknown `STEM_BACKEND` values produce a **config warning** and behave as **`hybrid`**. `get_2stem_stage1_preview(..., stem_backend=STEM_BACKEND)` reflects this for server logs.

## 4-stem routing order

1. **SCNet ONNX** — If `USE_SCNET=1` and `models/scnet.onnx/scnet.onnx` exists.
2. **Hybrid** — Stage 1 vocals + instrumental, then **PyTorch Demucs** (`htdemucs.pth` / `htdemucs.th`) on the instrumental via subprocess (`run_hybrid_4stem`).

Demucs **ONNX/ORT** 4-stem inference was removed; production relies on **PyTorch weights** for Demucs.

## 2-stem Stage 1 priority

Implemented in `stem_service/vocal_stage1.py` (`extract_vocals_stage1`). When `prefer_speed` is false and `model_tier` is **balanced** or **quality**, **MDX23C** is attempted first (if vocal weights exist and are configured):

1. **MDX23C rank 0** — **quality:** `mdx23c_vocal` only; instrumental = mix − vocal inside `mdx_onnx` (one ONNX pass). **balanced:** `mdx23c_vocal` + `mdx23c_instrumental` ONNX (two passes).
2. **UVR_MDXNET_3_9662** (or valid `vocal_model_override`) — optional audio-separator CLI; else vocal ONNX + optional second instrumental ONNX (`USE_TWO_STEM_INST_ONNX_PASS`) or **phase inversion pending**.
3. **UVR_MDXNET_KARA** — same pairing rules as rank 1.
4. **MDX23C rank 3** — same quality/balanced split as step 1 if step 1 did not return.
5. **Demucs** `htdemucs` `--two-stems=vocals` (native vocals + `no_vocals`).

Hybrid code does **not** infer behavior from `instrumental_path is None` alone: see **`InstrumentalSource`** and **`[MODEL-PARAMS.md](MODEL-PARAMS.md)`** (*Stage 1 return value*).

## Related docs

- [MODEL-PARAMS.md](MODEL-PARAMS.md) — MDX tensor params, overlap, **`InstrumentalSource`** / 4-tuple Stage 1 return
- [MODEL-SELECTION-AUTHORITY.md](MODEL-SELECTION-AUTHORITY.md) — tier lists vs production waterfall
- [benchmark-demucs-onnx.md](benchmark-demucs-onnx.md) — historical notes on Demucs ONNX benchmarks (ONNX path retired)
- [ORT-MODEL-CONVERSION.md](ORT-MODEL-CONVERSION.md) — optional build-time ONNX → ORT (faster loads; `models/demucs.onnx-main` README context)
- [MODELS-INVENTORY.md](MODELS-INVENTORY.md) — Files under `models/`
- [CPU-OPTIMIZATION-TIPS.md](CPU-OPTIMIZATION-TIPS.md) — Threading and env tuning
- [JOB-METRICS.md](JOB-METRICS.md) — `job_metrics.jsonl` and modes
- [ONNX-EFFICIENCY-INVESTIGATION.md](ONNX-EFFICIENCY-INVESTIGATION.md) — ONNX path notes

Historical research drafts live under [archive/](archive/README.md).
