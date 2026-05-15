# Stem separation pipeline (canonical)

This document describes the **implemented** behavior in `stem_service/`. For installation, scripts, deployment, and the **t3.large CPU-only / WSL Ubuntu / `source .venv/bin/activate`** setup, use the root [README.md](../README.md) (*Target environment*).

## Product flow

1. **Split** — Always starts as **2-stem** (vocals + instrumental) unless the user requests **4-stem** directly via API (`stems=4`).
2. **Expand** — From a completed 2-stem job, **Keep going → 4 stems** runs separation on the **instrumental** only (vocals copied), producing drums, bass, other.
3. **Load stems** — Users can load external WAV/MP3 files as mixer tracks (no separation).

## Quality tiers (`quality` form field / JSON)

| Value | Intent | Typical behavior |
|--------|--------|------------------|
| **speed** | Fastest turnaround | Fast ONNX models (UVR_MDXNET_3_9662); MDX chunk overlap 50%. |
| **quality** | Default: best quality at acceptable speed | Kim_Vocal_2 ONNX models; MDX overlap 75% (smoother chunk boundaries). |
| **ultra** | Maximum separation (premium) | RoFormer / large checkpoints via `audio-separator`; very slow on CPU. |

> **Note:** "balanced" is accepted by the API for backward compatibility but is treated identically to "quality" at runtime. There is no separate "balanced" pipeline.

## `STEM_BACKEND` (`hybrid` vs `demucs_only`)

| Mode | 2-stem | 4-stem |
|------|--------|--------|
| **`hybrid`** (default) | `run_hybrid_2stem` → `extract_vocals_stage1` (ONNX waterfall + phase inversion) | `run_4stem_single_pass_or_hybrid` (hybrid: Stage 1 vocals + Demucs on instrumental) |
| **`demucs_only`** | `run_demucs_only_2stem` → PyTorch `htdemucs` `--two-stems=vocals` only (no MDX ONNX) | `run_demucs` 4-stem only |

Unknown `STEM_BACKEND` values produce a **config warning** and behave as **`hybrid`**.

## 4-stem routing

1. **Hybrid** (default, `FOUR_STEM_BACKEND=hybrid`) — Stage 1 extracts vocals via ONNX waterfall, phase inversion produces instrumental, then **PyTorch Demucs** (`htdemucs.th`) runs 4-stem on the instrumental via subprocess. Demucs vocals output is discarded (Stage 1 vocals are higher quality).
2. **SCNet** (optional, `FOUR_STEM_BACKEND=auto`) — Tries SCNet PyTorch or ONNX first, falls back to hybrid.

## 2-stem Stage 1 waterfall

Implemented in `stem_service/vocal_stage1.py` (`extract_vocals_stage1`). Models are tried in order until one succeeds:

### Speed tier (`prefer_speed=True`)

1. **UVR_MDXNET_3_9662** (.ort preferred, .onnx fallback) — score 9, ~27s/30s clip
2. **UVR_MDXNET_KARA** (.ort preferred, .onnx fallback) — score 9, ~28s/30s clip
3. **PyTorch htdemucs** `--two-stems=vocals` (last resort)

### Quality tier (default)

1. **Kim_Vocal_2** (.ort preferred, .onnx fallback) — score 9, ~68s/30s clip
2. **Kim_Vocal_1** (.ort preferred, .onnx fallback) — score 9, ~65s/30s clip
3. **UVR_MDXNET_3_9662** (fallback) — score 9, ~27s/30s clip
4. **UVR_MDXNET_KARA** (fallback) — score 9, ~28s/30s clip
5. **PyTorch htdemucs** `--two-stems=vocals` (last resort)

### Instrumental production

- **Phase inversion** (`original − vocals`) is the default method when ONNX produces vocals only.
- If `USE_TWO_STEM_INST_ONNX_PASS=1`, a second ONNX pass with `UVR-MDX-NET-Inst_HQ_5` produces the instrumental directly (slower but avoids subtraction artifacts).
- When Demucs is the fallback, it produces both vocals and `no_vocals` natively (no phase inversion needed).

### Models NOT in the waterfall

- **MDX23C** — excluded; ~122s/30s clip is too slow for production CPU.
- **UVR_MDXNET_1/2** — excluded; score 8.5 (below the 9.0 minimum).
- **Voc_FT** — excluded from default; ~75s and same score as Kim models which have better separation characteristics.

## Audio processing pipeline (quality notes)

1. **Intermediate stems** are written as **32-bit float WAV** to avoid compounding quantization noise through phase inversion and Demucs Stage 2.
2. **Final output stems** are converted to **16-bit PCM WAV with TPDF dithering** as the last step before delivery.
3. **Phase inversion** uses a soft limiter at threshold=0.98 (preserves 98% of dynamic range; only catches rare inter-sample peaks).
4. **48kHz input** is resampled to 44.1kHz for ONNX inference (model training rate) with `lowpass_filter_width=64` for higher-quality anti-aliasing, then resampled back to original rate for output.

## ORT model preference

Runtime prefers `.ort` siblings when present (`resolve_mdx_model_path()`). ORT format loads faster and runs slightly faster than `.onnx` on CPU. Tier lists use `.onnx` logical names; resolution is automatic.

## Related docs

- [MODEL-PARAMS.md](MODEL-PARAMS.md) — MDX tensor params, overlap, `InstrumentalSource` / 4-tuple Stage 1 return
- [MODEL-SELECTION-AUTHORITY.md](MODEL-SELECTION-AUTHORITY.md) — tier lists, benchmark CSV, decision rules
- [MODELS-INVENTORY.md](MODELS-INVENTORY.md) — Files under `models/`
- [CPU-OPTIMIZATION-TIPS.md](CPU-OPTIMIZATION-TIPS.md) — Threading and env tuning
- [JOB-METRICS.md](JOB-METRICS.md) — `job_metrics.jsonl` and modes

Historical research drafts live under [archive/](archive/README.md).
