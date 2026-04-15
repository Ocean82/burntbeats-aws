# ONNX Runtime Guide (Current Stack)

**Last updated:** 2026-04-15

This file documents the ONNX runtime behavior used by Burnt Beats stem separation.
It replaces older transformer-oriented notes that did not apply to this audio pipeline.

---

## What ONNX is used for

- **2-stem Stage 1 (primary ONNX path):**
  - MDX vocal models in `stem_service/mdx_onnx.py`
  - optional instrumental ONNX pass (usually disabled; phase inversion is default)
- **4-stem optional fast path:**
  - SCNet ONNX in `stem_service/scnet_onnx.py` when enabled and self-test passes
- **Not used in active production path:**
  - In-process Demucs ONNX

Demucs in active 4-stem fallback path runs as PyTorch subprocess (`stem_service/split.py`).

---

## Runtime behavior and selection

### Model file preference order

For MDX ONNX models, runtime resolution is:

1. Prefer sibling `.ort` (if present)
2. Otherwise use `.onnx`
3. If `USE_INT8_ONNX=1`, prefer `.quant.onnx` sibling when present

Key function: `resolve_mdx_model_path()` in `stem_service/mdx_onnx.py`.

### ONNX session options

Both MDX and SCNet ONNX sessions use:

- `ORT_ENABLE_ALL` graph optimization level
- Providers from `get_onnx_providers()` in `stem_service/config.py`
- Optional explicit thread cap via `ONNXRUNTIME_NUM_THREADS`
  - when set to a number: `intra_op_num_threads=N`, `inter_op_num_threads=1`

### Provider selection

`get_onnx_providers()` behavior:

- `USE_ONNX_CPU=1` -> CPU-only provider
- otherwise prefer `CUDAExecutionProvider` when available
- optionally append `OpenVINOExecutionProvider` when `USE_ONNX_OPENVINO=1`
- always include CPU fallback

---

## Current policy ties (important)

- 4-stem speed policy is **Demucs rank 28 only** (no speed fallback model).
- ONNX improvements mainly impact:
  - 2-stem speed/quality throughput
  - SCNet path when `FOUR_STEM_BACKEND=auto`
- If `FOUR_STEM_BACKEND=hybrid`, 4-stem skips SCNet and goes straight to hybrid Demucs pipeline.

## Locked Production Policy (Non-Negotiables)

- Use ranked, user-approved checkpoints only. Do not substitute lower-ranked models.
- Keep single-pass Stage 1 default behavior. Do not add dual vocal+instrumental ONNX passes in production.
- Keep instrumental derivation as phase inversion by default (`USE_TWO_STEM_INST_ONNX_PASS` unset/false).
- Do not add latency-increasing extra passes unless explicitly approved.
- Preserve 4-stem fast policy: rank 28 only.

See:

- `docs/ARCHITECTURE-FLOW.md`
- `docs/MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md`
- `docs/ONNX-EFFICIENCY-INVESTIGATION.md`

---

## Practical optimization checklist

1. Ensure active MDX models have `.ort` artifacts (and keep `.onnx` fallback).
2. Keep `USE_INT8_ONNX=1` when quality checks pass for your selected vocal models.
3. Tune `ONNXRUNTIME_NUM_THREADS` per host class (for `t3.large`, start with `2`).
4. Keep `USE_ONNX_CPU=1` in CPU-only deployments; disable only when validated GPU runtime exists.
5. For 4-stem speed experiments, test `FOUR_STEM_BACKEND=auto` with SCNet model present and self-test green.
6. Benchmark with your real clips after any ORT/quant/thread changes.

---

## What was wrong before

- This document previously contained generic Hugging Face transformer optimization material
  (BERT/GPT/Longformer) that is not used by this repository.
- Those notes are now removed to avoid configuration mistakes and false assumptions.

---

## Validation commands

Use current project scripts for A/B checks:

```bash
python scripts/benchmark_onnx_vs_ort.py --wav "C:/path/to/song.wav"
python scripts/t3-large-benchmark.sh
```

If you need to force raw ONNX for comparison:

```bash
set BURNTBEATS_DISALLOW_ORT=1
```

(PowerShell session variable syntax can vary; set according to your shell/profile.)
