# Stem separation pipeline (canonical) should be updated and investigated frequently and tagged with date and time of last check. 
##***verify and update entire file**
This document describes the **implemented** behavior in `stem_service/`. For installation, scripts, deployment, and the **t3.large CPU-only / WSL Ubuntu / `source .venv/bin/activate`** setup, use the root [README.md](../README.md) (*Target environment*).


## Quality tiers (`quality` form field / JSON)

| Value | Intent | Typical behavior |
|--------|--------|------------------|
update

Exact routing is in `stem_service/server.py` → `stem_service/hybrid.py`, `vocal_stage1.py`, `mdx_onnx.py`, `scnet_onnx.py`, `split.py`, `ultra.py`.


## 4-stem routing order

update
.

## 2-stem Stage 1 priority

update

Hybrid code does **not** infer behavior from `instrumental_path is None` alone: see **`InstrumentalSource`** and **`[MODEL-PARAMS.md](MODEL-PARAMS.md)`** (*Stage 1 return value*).

## 2-stem ORT model contract (consistency) update and verify. use time and date for frequent checks. 

For 2-stem ONNX Runtime inference, runtime should prefer `.ort` siblings when present (`resolve_mdx_model_path()`), and teams should keep the following logical order consistent:

- **Fast 2-stem primary:** `UVR_MDXNET_3_9662.ort`
- **Fast 2-stem fallback:** `UVR_MDXNET_KARA.ort`
- **Quality 2-stem primary:** `Kim_Vocal_2.ort`
- **Quality 2-stem fallback:** `Kim_Vocal_1.ort`

Notes:

- These entries are the intended vocal model contract for 2-stem selection consistency.
- If an `.ort` file is missing, runtime may fall back to `.onnx` for the same logical model name.

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
