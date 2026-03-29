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

### `htdemucs_6s` ONNX — filename, mapping, and listening checks

- **Only one path is used in production:** `models/htdemucs_6s.onnx` (exact name). Other copies in the same folder (e.g. `htdemucs_6s (3).onnx`) are for benchmarks / experiments only unless you rename/replace the canonical file.
- **6 stems → 4 API stems:** The service keeps Demucs indices **drums (0), bass (1), other (2), vocals (3)** and **does not** mix **guitar (4)** or **piano (5)** into `other` (see `stem_service/demucs_onnx.py`). On some material, much harmonic content can land in guitar/piano, so **`other` can sound very quiet** even though WAV files exist.
- **If `bass` *and* `other` both sound empty** while drums/vocals are fine: that is **not** explained by dropping guitar/piano alone (bass is still index 1). Treat it as worth **verifying** (per-stem RMS on the written WAVs, or A/B vs `htdemucs_embedded.onnx` on the same instrumental). A bad or non-standard ONNX export (or different stem order than assumed) can produce misleadingly labeled stems.

Empirical job-log notes: some runs with `htdemucs_6s` matched **audible drums + vocals** but **weak or silent bass/other** on listening—align expectations and QA with the points above.

## 2-stem Stage 1 priority

1. **MDX23C** vocal + instrumental ONNX if both present and configured.
2. Otherwise **Kim_Vocal_2 / Voc_FT** + **Inst_HQ_** ONNX (or phase inversion if only vocal ONNX).
3. Else **Demucs** `--two-stems=vocals` (native vocals + no_vocals).

## Related docs

- [benchmark-demucs-onnx.md](benchmark-demucs-onnx.md) — `tmp/_bench_*` benchmark output vs production ONNX (`stem_service/demucs_onnx.py`)
- [ORT-MODEL-CONVERSION.md](ORT-MODEL-CONVERSION.md) — optional build-time ONNX → ORT (faster loads; `models/demucs.onnx-main` README context)
- [MODELS-INVENTORY.md](MODELS-INVENTORY.md) — Files under `models/`
- [CPU-OPTIMIZATION-TIPS.md](CPU-OPTIMIZATION-TIPS.md) — Threading and env tuning
- [JOB-METRICS.md](JOB-METRICS.md) — `job_metrics.jsonl` and modes
- [ONNX-EFFICIENCY-INVESTIGATION.md](ONNX-EFFICIENCY-INVESTIGATION.md) — ONNX path notes

Historical research drafts live under [archive/](archive/README.md).
