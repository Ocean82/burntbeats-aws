# ONNX efficiency investigation

**Date:** 2026-03-15  

**Status (2026-04):** In-process **Demucs ONNX** was **removed**. 4-stem uses **SCNet ONNX** (optional) + **PyTorch Demucs**. The inventory table below still lists `htdemucs_*.onnx` rows as **file inventory** — treat the “Wired?” column for those rows as **historical**. Current routing: [stem-pipeline.md](stem-pipeline.md).

**Goal (original):** Determine if the stem pipeline can run ONNX-only for maximum efficiency (speed + memory) and whether we are on the most efficient path given the models in `models/`.

---

## 1. ONNX model inventory (models/)

| Location | File | Wired? | Used for |
|----------|------|--------|----------|
| **mdxnet_models/** | Kim_Vocal_2.onnx | ✅ | Stage 1 vocals (MDX ONNX) |
| **mdxnet_models/** | UVR-MDX-NET-Voc_FT.onnx | ✅ | Stage 1 vocals (fallback) |
| **mdxnet_models/** | UVR-MDX-NET-Inst_HQ_4.onnx | ✅ | Stage 1 instrumental |
| **mdxnet_models/** | UVR-MDX-NET-Inst_HQ_5.onnx | ✅ | Stage 1 instrumental (in root + MDX_Net_Models too) |
| **mdxnet_models/** | Reverb_HQ_By_FoxJoy.onnx | ❌ | Not in VOCAL/INST path list |
| **mdxnet_models/** | UVR_MDXNET_KARA_2.onnx | ❌ | Not in path list (karaoke variant) |
| **MDX_Net_Models/** | UVR-MDX-NET-Inst_HQ_5.onnx | ✅ | Instrumental (in INST path list) |
| **MDX_Net_Models/** | UVR_MDXNET_1_9703.onnx | ❌ | Not in hardcoded config (different n_fft/dim) |
| **MDX_Net_Models/** | UVR_MDXNET_2_9682.onnx | ❌ | Not in hardcoded config |
| **MDX_Net_Models/** | UVR_MDXNET_3_9662.onnx | ❌ | Not in hardcoded config |
| **MDX_Net_Models/** | UVR_MDXNET_KARA.onnx | ❌ | Karaoke; not wired |
| **models/ root** | htdemucs_embedded.onnx | ❌ (retired) | Not loaded for 4-stem; PyTorch Demucs instead |
| **models/ root** | htdemucs_6s.onnx | ❌ (retired) | Same |
| **models/ root** | demucsv4.onnx | ❌ (retired) | Same |
| **models/ root** | htdemucs.onnx | ❌ | Same |
| **models/ root** | karaoke.onnx | ❌ | Not in mdx_onnx |
| **models/ root** | silero_vad.onnx | ✅ | VAD pre-trim (optional) |
| **models/ root** | UVR-MDX-NET-Voc_FT.onnx | ✅ | Vocal (root fallback) |
| **models/ root** | UVR-MDX-NET-Inst_HQ_5.onnx | ✅ | Instrumental (root fallback) |

**Summary:** ONNX drives **Stage 1 (2-stem)** (MDX vocal/inst) and optional **SCNet** / **VAD**. **4-stem Demucs** is **PyTorch**, not ONNX, in current code.

**Unused / not wired:** Reverb_HQ_By_FoxJoy, UVR_MDXNET_KARA*, karaoke.onnx, htdemucs.onnx (if different from embedded). Adding UVR_MDXNET_1/2/3 would require probing their tensor shapes and adding configs in `mdx_onnx.py`.

---

## 2. Current pipeline vs ONNX-only capability

### 2-stem

| Mode | Before fix | After fix (recommended) |
|------|------------|--------------------------|
| **Speed** | Demucs 2-stem **subprocess only** (htdemucs.th, PyTorch) — slow, high memory | **ONNX-first:** Stage 1 MDX ONNX (vocal + inst or phase inversion). Demucs 2-stem only when ONNX missing. |
| **Quality** | ONNX vocal + ONNX inst (or phase inversion); fallback Demucs 2-stem | Unchanged (already ONNX-first). |

So **2-stem can be ONNX-only** when MDX vocal + instrumental ONNX are present. The only inefficiency was Speed forcing the Demucs subprocess.

### 4-stem (current code, 2026-04)

| Step | Behavior |
|------|----------|
| **First** | SCNet ONNX when `USE_SCNET` and model pass self-test |
| **Then** | `run_hybrid_4stem`: Stage 1 MDX/Demucs 2-stem → Stage 2 **PyTorch** `run_demucs(..., stems=4)` |

Demucs **ONNX** is no longer in this path. Sections below this line in the original investigation remain as **historical** reasoning about why subprocess Demucs was costly.

---

## 3–7. Historical (pre-removal) — subprocess cost

Older text discussed `run_demucs_onnx_4stem` and falling back to hybrid when ONNX failed. That path is **removed**. For verification today, see logs: `4-stem: trying SCNet ONNX`, `4-stem: SCNet ONNX succeeded`, or `4-stem: using hybrid pipeline (Stage 1 + PyTorch Demucs subprocess)`.

## Code references (current)

| Component | File | Role |
|-----------|------|------|
| MDX vocal/inst ONNX | `stem_service/mdx_onnx.py` | Stage 1 MDX |
| SCNet 4-stem | `stem_service/scnet_onnx.py` | Optional fast 4-stem |
| Hybrid 4-stem | `stem_service/hybrid.py` | `run_4stem_single_pass_or_hybrid`, `run_hybrid_4stem` |
| Demucs subprocess | `stem_service/split.py` | `run_demucs` (PyTorch) |
