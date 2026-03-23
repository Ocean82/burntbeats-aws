# Stem separation pipeline (canonical)

This document describes the **implemented** behavior in `stem_service/`. For installation, scripts, deployment, and the **t3.large CPU-only / WSL Ubuntu / `source .venv/bin/activate`** setup, use the root [README.md](../README.md) (*Target environment*).

## Product flow

1. **Split** — Always starts as **2-stem** (vocals + instrumental) unless the user requests **4-stem** directly via API (`stems=4`).
2. **Expand** — From a completed 2-stem job, **Keep going → 4 stems** runs separation on the **instrumental** only (vocals copied), producing drums, bass, other.
3. **Load stems** — Users can load external WAV/MP3 files as mixer tracks (no separation).

## Quality tiers (`quality` form field / JSON)

| Value | Intent | Typical behavior |
|--------|--------|------------------|
| **speed** | Fastest turnaround | VAD pre-trim when `USE_VAD_PRETRIM`; MDX chunk overlap 50%; coarser sliding-window stride on SCNet / Demucs **embedded** ONNX where applicable. |
| **quality** | Default: balance of quality and time | Full-length processing; MDX overlap 75%; tighter window stride on SCNet / embedded Demucs ONNX; hybrid fallback unchanged. |
| **ultra** | Maximum separation (premium) | RoFormer / large checkpoints via `audio-separator`; requires extra deps; very slow on CPU unless explicitly allowed. |

Exact routing is in `stem_service/server.py` → `stem_service/hybrid.py`, `vocal_stage1.py`, `mdx_onnx.py`, `demucs_onnx.py`, `scnet_onnx.py`, `split.py`, `ultra.py`.

## 4-stem routing order

1. **SCNet ONNX** — If `USE_SCNET=1` and `models/scnet.onnx/scnet.onnx` exists.
2. **Demucs ONNX** — `htdemucs_embedded` (speed path) vs `htdemucs_6s` (quality path), depending on `prefer_speed`.
3. **Hybrid** — Stage 1 vocals + instrumental, then **Demucs subprocess** on instrumental (`run_hybrid_4stem`).

## 2-stem Stage 1 priority

1. **MDX23C** vocal + instrumental ONNX if both present and configured.
2. Otherwise **Kim_Vocal_2 / Voc_FT** + **Inst_HQ_** ONNX (or phase inversion if only vocal ONNX).
3. Else **Demucs** `--two-stems=vocals` (native vocals + no_vocals).

## Related docs

- [MODELS-INVENTORY.md](MODELS-INVENTORY.md) — Files under `models/`
- [CPU-OPTIMIZATION-TIPS.md](CPU-OPTIMIZATION-TIPS.md) — Threading and env tuning
- [JOB-METRICS.md](JOB-METRICS.md) — `job_metrics.jsonl` and modes
- [ONNX-EFFICIENCY-INVESTIGATION.md](ONNX-EFFICIENCY-INVESTIGATION.md) — ONNX path notes

Historical research drafts live under [archive/](archive/README.md).
