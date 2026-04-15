# New models and faster alternatives (no quality loss)
#update this file. keep dates current. 
**Date:** 2026-03-16  
**Goal:** Investigate the project’s model files for new models and potential alternatives that are faster than current choices without losing quality.

---

## 1. Current model usage (recap)

| Role | Current model(s) | Location | Speed vs quality |
|------|------------------|----------|-------------------|
| **2-stem vocal** | Kim_Vocal_2, UVR-MDX-NET-Voc_FT | mdx_onnx | Kim_Vocal_2 is fast; Voc_FT fallback. |
| **2-stem instrumental** | UVR-MDX-NET-Inst_HQ_4, Inst_HQ_5 | mdx_onnx | HQ_5 often slightly better; both same config. |
| **4-stem** | SCNet ONNX → PyTorch `htdemucs` | `scnet_onnx.py`, `split.py` | ONNX path for Demucs 4-stem was removed; see `stem-pipeline.md`. |
| **Dereverb** | Reverb_HQ_By_FoxJoy.onnx | mdx_onnx | Optional post-pass; not in default path list. |
| **VAD** | silero_vad.onnx | silero_onnx_vad | Small, cheap; optional pre-trim. |
| **Ultra (2-stem)** | RoFormer .ckpt (e.g. bs_roformer_317) | ultra.py | Best quality; GPU-only in practice. |

---

## 2. Models already in the repo (wired vs unwired)

### 2.1 Wired and in use

- **mdxnet_models/:** Kim_Vocal_2, Voc_FT, Inst_HQ_4, Inst_HQ_5, Reverb_HQ_By_FoxJoy (dereverb).
- **MDX_Net_Models/:** Inst_HQ_5, UVR_MDXNET_*.onnx (1, 2, 3, KARA) — only Inst_HQ_5 is in the INST path; UVR_MDXNET_1/2/3 are **not** in `_MDX_CONFIGS` so they are **not used**.
- **models/ root:** htdemucs.pth → .th (Demucs subprocess); silero_vad.onnx (if present; code also supports silero_vad.jit).
- **Demucs ONNX files** (if still on disk): experimental / inventory only — **not** loaded for 4-stem in production.

### 2.2 Present but not wired

| File(s) | Where | What’s needed to use |
|---------|--------|----------------------|
| **UVR_MDXNET_1_9703.onnx, UVR_MDXNET_2_9682.onnx, UVR_MDXNET_3_9662.onnx** | MDX_Net_Models/ | Probe input shape (batch, 4, dim_f, dim_t); add `(n_fft, hop=1024, dim_f, dim_t, compensate)` to `_MDX_CONFIGS` in `mdx_onnx.py`; add paths to VOCAL or INST list. Often **smaller/lighter** than HQ_4/5; may be faster with slightly lower quality — worth benchmarking. |
| **UVR_MDXNET_KARA.onnx, UVR_MDXNET_KARA_2.onnx** | mdxnet_models/, MDX_Net_Models/ | Karaoke variants; add config + path if you want a karaoke-specific stem. |
| **Reverb_HQ_By_FoxJoy.onnx** | In mdx_onnx path list | Already in DEREVERB list; used when ultra calls `run_dereverb_onnx`. Not in default 2-stem path; no change needed unless you want dereverb in non-ultra flow. |
| **UVR-MDX-NET_Crowd_HQ_1.onnx** | models/ (if present) | “Crowd” / ambience model; add config (probe shape) + path if you need that stem. |
| **BSRoformer-*.gguf, decoder_model*.onnx, vocals.int8.onnx** | models/ (if present) | Likely from other tools (LLM/whisper/etc.). Not part of stem pipeline; ignore unless you have a specific use. |

### 2.3 From stem-models source (not copied by copy-models.sh)

- **MDX23C-8KFFT-InstVoc_HQ.ckpt, MDX23C_D1581.ckpt** — GPU/ultra path; no ONNX in repo.
- **model_bs_roformer_ep_937_sdr_10.5309.ckpt** — Lighter RoFormer; still PyTorch/GPU-oriented.
- **v5_July_2021_5_Models (HP2-4BAND, Vocal_HP_4BAND)** — Different architecture; would need a separate pipeline.
- **flow-models (EMBER-DEMUCS, VAE, etc.)** — Different stack; not drop-in.

---

## 3. Faster alternatives (same or better quality)

### 3.1 Use what you already have (no new downloads)

1. **INT8 quantized ONNX (MDX)**  
   You already support `.quant.onnx`: `scripts/quantize_onnx_models.py` builds them; `USE_INT8_ONNX=1` (default) prefers them. **Faster on CPU** (AVX2/VNNI) with minimal quality loss. Ensure all MDX models you use have a `.quant.onnx` sibling and that the stem service is restarted after generating them.

2. **Wire UVR_MDXNET_1 / 2 / 3 for a “speed” vocal or inst path**  
   These are often smaller than HQ_4/5. Steps:
   - Run `scripts/probe_onnx.py` (or add the three files) to get input shape `(1, 4, dim_f, dim_t)`.
   - Derive `n_fft` from `n_fft//2+1 >= dim_f` (hop=1024), choose `compensate` (e.g. 1.035 if same as other MDX).
   - Add to `_MDX_CONFIGS` and append to `VOCAL_MODEL_PATHS` or `INST_MODEL_PATHS` (e.g. try Inst first as “lighter inst” option).
   - Benchmark: compare time and quality vs Kim_Vocal_2 / Inst_HQ_5 on a few tracks. If faster and quality is acceptable, you have a **faster alternative without new files**.

3. **Demucs 4-stem**  
   Use **PyTorch** weights and `run_demucs`; optional **SCNet** ONNX first. In-process Demucs ONNX was removed as a primary path.

### 3.2 New or external models (optional)

| Option | Description | Speed vs quality | Integration effort |
|--------|-------------|-------------------|--------------------|
| **UVR-MDX-NET-Inst_Main.onnx** | Lighter instrumental (e.g. ~53 MB). | Often faster than Inst_HQ_*; quality a bit lower. | Probe shape, add config + path; use as “speed” inst option. |
| **UVR-MDX-NET-Inst_HQ_2.onnx** | Another HQ variant (~67 MB). | Between Main and HQ_4/5. | Same as above. |
| **MDX23C ONNX (if available)** | MDX23C in ONNX form. | High quality; may be faster than RoFormer .ckpt on CPU if ONNX exists. | Would need an ONNX export (UVR/audio-separator community); then add config like MDX. |
| **Demucs v4 hybrid ONNX** | Community experiments (e.g. Mixxx, sevagh/demucs.onnx). | Research only until a maintained export exists. | Would require a new module if reintroduced; current stack uses PyTorch Demucs for 4-stem. |
| **Smaller VAD** | Silero VAD is already small; optional replacement with a tinier ONNX VAD if one appears. | Marginal gain; VAD is cheap. | Low; swap model path. |

### 3.3 What to avoid for “faster without losing quality”

- **Spleeter:** Faster but lower quality than your current MDX + PyTorch Demucs path; adds TensorFlow. Not recommended.
- **Replacing Kim_Vocal_2 / Inst_HQ_5 with much smaller models** without testing: risk of audible quality drop; always A/B and measure.

---

## 4. Recommended action plan... update should be done regulary. not current. 

1. **Short term (no new downloads)**  
   - Ensure all MDX ONNX models you use have `.quant.onnx` and that the service uses them (`USE_INT8_ONNX=1`).  
   - Probe **UVR_MDXNET_1_9703**, **UVR_MDXNET_2_9682**, **UVR_MDXNET_3_9662** (input shape), add configs and paths in `mdx_onnx.py`, then benchmark vs current vocal/inst models. If one is faster and quality is acceptable, add it as a “speed” option (e.g. prefer it when `prefer_speed=True`).

2. **Medium term (optional new files)**  
   - Add **Inst_Main** or **Inst_HQ_2** as an optional “light inst” model (probe + config + path); benchmark.  
   - Watch for **Demucs v4 ONNX** or **MDX23C ONNX** releases; add as optional models when available and stable.

3. **Do not**  
   - Remove or replace your current best-quality models (Kim_Vocal_2, Inst_HQ_5, htdemucs_6s) without side-by-side tests.  
   - Add heavy RoFormer/PyTorch-only models as “default” on CPU; keep them as optional “ultra” path.

---

## 5. References
#not current. 
- **Probe script:** `scripts/probe_onnx.py` (add any new ONNX path to probe input/output shapes).  
- **MDX config:** `stem_service/mdx_onnx.py` — `_MDX_CONFIGS`, `VOCAL_MODEL_PATHS`, `INST_MODEL_PATHS`.  
- **Quantization:** `scripts/quantize_onnx_models.py`, `docs/archive/QUANTIZATION-8BIT.md`.  
- **Inventory:** `docs/MODELS-INVENTORY.md`, `docs/ONNX-EFFICIENCY-INVESTIGATION.md`.
