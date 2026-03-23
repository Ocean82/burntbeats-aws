# NEW-flow implementation plan

**Date:** 2026-03-17  
**Source:** [NEW-flow.md](NEW-flow.md) (research for CPU-only t3.large).

---

## Agreement with NEW-flow

- **Default 4-stem on CPU:** Prefer **SCNet** when available (paper: 9.0 dB SDR MUSDB18-HQ, **CPU time ~48% of HT Demucs**). Keep Demucs htdemucs as HQ fallback.
- **2-stem:** Current stack is MDX ONNX (Kim_Vocal_2 / Voc_FT) + instrumental ONNX or phase inversion. NEW-flow suggests **SCNet 4-stem → collapse** (sum drums+bass+other = instrumental) as an alternative; we already have a fast 2-stem path (MDX). Optional later: add SCNet 2-stem mode (one model run) for users who want maximum speed over vocal-specialist quality.
- **First step slowness:** Likely from (1) Stage 1 MDX overlap (75% quality = many chunks) and (2) 4-stem expand using Demucs. Mitigations: keep 50% overlap in speed mode; add **SCNet as first choice for 4-stem** so expand uses SCNet when available (~half the Demucs time).
- **Avoid as default:** htdemucs_ft (4× slower), htdemucs_6s for production (piano issues). We already use htdemucs_embedded for speed and 6s only in quality; no change needed.

---

## Current vs NEW-flow

| Aspect | Current | NEW-flow recommendation | Implementation |
|--------|---------|-------------------------|-----------------|
| 4-stem (expand) | Demucs ONNX (embedded/6s) or subprocess | SCNet first, then Demucs | Try SCNet ONNX first when `USE_SCNET=1` and model present; else existing Demucs path |
| 2-stem | MDX vocal + inst ONNX or phase inversion | MDX23C or SCNet collapse | Keep current; optional: add SCNet 4→2 collapse as alternate mode later |
| First-step speed | MDX 50% (speed) / 75% (quality) overlap | — | Already 50% for speed; document that quality uses 75% (more chunks) |

---

## SCNet ONNX (existing asset)

- **Path:** `models/scnet.onnx/scnet.onnx` (42.5 MB). Already in repo.
- **Probed I/O (scripts/probe_onnx.py):**
  - Input: `spectrogram` `(batch, 4, 2049, time)` — same layout as Demucs spec: [L_real, L_imag, R_real, R_imag], n_fft=4096 → 2049 bins.
  - Output: `sources` `(batch, 4, 4, 2049, time)` — 4 stems (drums, bass, other, vocals), each (4, 2049, time).
- **Segment:** Use same approach as Demucs ONNX: hop=1024, 336 time frames → 344064 samples (~7.8 s), 50% overlap for chunking.
- **Input shape:** `scnet_onnx.py` reads (freq, time) from the model’s input shape at runtime. Some ONNX exports use 2048 frequency bins (like Demucs ONNX); others use 2049. If you previously saw `MatMul dimension mismatch`, ensure the model is loaded and that the ONNX has concrete or inferred input dimensions; the code now adapts to 2048 or 2049.

---

## Implementation steps (done / planned)

1. **Config:** `USE_SCNET=1` (default on), `SCNET_ONNX` path. When SCNet model exists and USE_SCNET is set, use SCNet for 4-stem before Demucs.
2. **Module:** `stem_service/scnet_onnx.py` — load ONNX, STFT (n_fft=4096, hop=1024, 2049 bins), chunk by time (336), run inference, iSTFT + overlap-add, write 4 WAVs. Stem order: drums, bass, other, vocals (MUSDB18).
3. **Expand (2→4):** In `run_expand_to_4stem`, if SCNet available and enabled, run SCNet on **instrumental** → drums, bass, other; keep existing vocals. Else current Demucs ONNX / subprocess.
4. **Optional (later):** 2-stem via SCNet: run SCNet on mix → vocals + (drums+bass+other). One model run; compare latency vs MDX vocal+inst.
5. **Docs:** [docs/README.md](README.md) and MODELS-INVENTORY updated to mention SCNet and NEW-flow.

---

## Env and config

| Env | Default | Effect |
|-----|--------|--------|
| `USE_SCNET` | `1` | When 1 and `scnet.onnx` present, use SCNet for 4-stem (expand) before Demucs. |

No change to existing Demucs or MDX env vars.

---

## Verifying which model ran

- **Job log (split):** `tmp/stems/{job_id}/job.log` (or `OUTPUT_BASE/{job_id}/job.log`). Look for:
  - `4-stem: trying SCNet ONNX first` then `4-stem: SCNet ONNX succeeded` → SCNet was used.
  - `4-stem: SCNet ONNX failed or returned None` → SCNet failed; next line will show Demucs or hybrid.
  - `4-stem: trying Demucs ONNX` / `4-stem: Demucs ONNX succeeded` → Demucs ONNX used.
  - `4-stem: using hybrid pipeline` → Stage 1 + Demucs subprocess.
- **Expand:** Same dir for the **expand** job id. Look for:
  - `expand: scnet_available=True  trying SCNet ONNX` then `expand: SCNet ONNX succeeded` → SCNet used.
  - `expand: SCNet ONNX returned None` or `expand: scnet_available=False` → Demucs path used.
- **API:** `GET /status/{job_id}` (or `/split/status/{job_id}`) returns `models_used` when status is `completed`. Example: `["scnet_onnx"]` vs `["htdemucs_embedded.onnx"]` vs `["htdemucs"]`.
- **2-stem:** Unchanged; no SCNet. Stage 1 uses MDX ONNX (e.g. Kim_Vocal_2) or Demucs 2-stem; see vocal_stage1 logs.
