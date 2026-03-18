# ONNX efficiency investigation

**Date:** 2026-03-15  
**Goal:** Determine if the stem pipeline can run ONNX-only for maximum efficiency (speed + memory) and whether we are on the most efficient path given the models in `models/`.

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
| **models/ root** | htdemucs_embedded.onnx | ✅ | 4-stem single-pass (Speed) |
| **models/ root** | htdemucs_6s.onnx | ✅ | 4-stem single-pass (Quality) |
| **models/ root** | demucsv4.onnx | ✅ | 4-stem fallback (if present) |
| **models/ root** | htdemucs.onnx | ❌ | **Not used** — code looks for `htdemucs_embedded.onnx` only |
| **models/ root** | karaoke.onnx | ❌ | Not in mdx_onnx or demucs_onnx |
| **models/ root** | silero_vad.onnx | ✅ | VAD pre-trim (optional) |
| **models/ root** | UVR-MDX-NET-Voc_FT.onnx | ✅ | Vocal (root fallback) |
| **models/ root** | UVR-MDX-NET-Inst_HQ_5.onnx | ✅ | Instrumental (root fallback) |

**Summary:** You have a full set of ONNX models for:
- **Stage 1 (2-stem):** Vocal (Kim_Vocal_2 / Voc_FT) + Instrumental (Inst_HQ_4/5) — all in mdxnet_models.
- **4-stem:** htdemucs_embedded.onnx (speed), htdemucs_6s.onnx (quality).
- **VAD:** silero_vad.onnx.

**Unused / not wired:** Reverb_HQ_By_FoxJoy, UVR_MDXNET_KARA*, karaoke.onnx, htdemucs.onnx (if different from embedded). Adding UVR_MDXNET_1/2/3 would require probing their tensor shapes and adding configs in `mdx_onnx.py`.

---

## 2. Current pipeline vs ONNX-only capability

### 2-stem

| Mode | Before fix | After fix (recommended) |
|------|------------|--------------------------|
| **Speed** | Demucs 2-stem **subprocess only** (htdemucs.th, PyTorch) — slow, high memory | **ONNX-first:** Stage 1 MDX ONNX (vocal + inst or phase inversion). Demucs 2-stem only when ONNX missing. |
| **Quality** | ONNX vocal + ONNX inst (or phase inversion); fallback Demucs 2-stem | Unchanged (already ONNX-first). |

So **2-stem can be ONNX-only** when MDX vocal + instrumental ONNX are present. The only inefficiency was Speed forcing the Demucs subprocess.

### 4-stem

| Step | Current | ONNX-only? |
|------|---------|------------|
| **First try** | `run_demucs_onnx_4stem()` — htdemucs_embedded.onnx (speed) or htdemucs_6s.onnx (quality) | ✅ Yes; in-process ONNX. |
| **Fallback** | `run_hybrid_4stem()`: Stage 1 (ONNX or Demucs 2-stem) → phase inversion → **Stage 2 `run_demucs(..., stems=4)` subprocess** | ❌ Subprocess = PyTorch Demucs = slow + high memory. |

So **4-stem is ONNX-only** when `htdemucs_embedded.onnx` (speed) or `htdemucs_6s.onnx` (quality) exist and inference succeeds. If `run_demucs_onnx_4stem()` returns `None` (e.g. model missing, wrong shape, runtime error), the code falls back to the hybrid path and runs the Demucs **subprocess** for Stage 2 — that is what causes slowness and high memory.

---

## 3. Why it was slow and memory-heavy

1. **2-stem Speed** always used the Demucs 2-stem **subprocess** (load htdemucs.th, full PyTorch, separate process). No ONNX was tried for 2-stem Speed.
2. **4-stem** might be falling back to hybrid if:
   - Demucs ONNX files are missing or misnamed (e.g. only `htdemucs.onnx` but code expects `htdemucs_embedded.onnx`),
   - or inference fails (input shape, sample rate, etc.),
   - so Stage 2 runs as subprocess (Demucs 4-stem) = high memory and slow.

You have both `htdemucs_embedded.onnx` and `htdemucs_6s.onnx`; if the pipeline still runs the subprocess for 4-stem, check logs for "Demucs ONNX: using ..." vs "Stage 2: Demucs 4-stem" to see which path is taken.

---

## 4. Most efficient path (recommendations)

1. **2-stem (Speed and Quality):** Use **ONNX-first** for both. Same path: `extract_vocals_stage1()` (MDX vocal ONNX + optional Inst ONNX or phase inversion). Demucs 2-stem subprocess only when no vocal ONNX is available. **Implemented:** `run_hybrid_2stem()` no longer has a Speed-only branch that runs Demucs 2-stem exclusively.
2. **4-stem:** Already tries Demucs ONNX first. Ensure `htdemucs_embedded.onnx` and `htdemucs_6s.onnx` are present and that inference succeeds (check logs). If it still falls back, add logging in `run_demucs_onnx_4stem()` to log why it returns `None` (e.g. session load failure, inference exception).
3. **Optional:** Add `htdemucs.onnx` as an alias for `htdemucs_embedded.onnx` in `demucs_onnx.py` if they are the same format (e.g. check input/output names with `probe_onnx.py`).
4. **Optional:** Wire karaoke / Reverb / UVR_MDXNET_1/2/3 if you need those stems; each requires config (n_fft, dim_f, dim_t, compensate) in `mdx_onnx.py`.

---

## 5. All paths now prefer ONNX runtime

- **Hybrid 2-stem:** ONNX-first via `extract_vocals_stage1()` (MDX vocal + inst or phase inversion); Demucs 2-stem only when ONNX missing.
- **Hybrid 4-stem:** `run_4stem_single_pass_or_hybrid` tries `run_demucs_onnx_4stem` first, then hybrid (Stage 2 subprocess).
- **demucs_only 2-stem:** Uses `run_hybrid_2stem` (same ONNX-first as hybrid).
- **demucs_only 4-stem:** Tries `run_demucs_onnx_4stem` first; only if it returns `None` runs `run_demucs(..., stems=4)` subprocess.
- **4-stem speed model:** If `htdemucs_embedded.onnx` is missing, `htdemucs.onnx` is used as fallback (same I/O as embedded where applicable).

## 6. Code references

| Component | File | Role |
|-----------|------|------|
| MDX vocal/inst ONNX | stem_service/mdx_onnx.py | VOCAL_MODEL_PATHS, INST_MODEL_PATHS, run_vocal_onnx, run_inst_onnx |
| Demucs ONNX 4-stem | stem_service/demucs_onnx.py | EMBEDDED_ONNX, SIX_STEM_ONNX, run_demucs_onnx_4stem |
| Stage 1 choice | stem_service/vocal_stage1.py | extract_vocals_stage1: ONNX first, then Demucs 2-stem |
| 2-stem entry | stem_service/hybrid.py | run_hybrid_2stem |
| 4-stem entry | stem_service/hybrid.py | run_4stem_single_pass_or_hybrid → run_demucs_onnx_4stem then run_hybrid_4stem |
| Demucs subprocess | stem_service/split.py | run_demucs (htdemucs.th, PyTorch subprocess) |

---

## 7. Verification

- **2-stem:** After change, run 2-stem Speed and check logs for "Stage 1: vocal ONNX" (and optionally "instrumental ONNX"). You should not see "Demucs 2-stem" unless ONNX is missing.
- **4-stem:** Run 4-stem and check logs for "Demucs ONNX session cached: htdemucs_embedded.onnx" or "htdemucs_6s.onnx". If you see "Stage 2: Demucs 4-stem" or subprocess invocation, Demucs ONNX either wasn’t used or failed.
