# ONNX Efficiency Investigation

**Date:** 2026-03-15  
**Last updated:** 2026-04-15

This doc is now a current-state efficiency summary (not historical planning).

---

## Current Truth

- In-process **Demucs ONNX is removed**.
- 2-stem is **ONNX-first** (MDX vocal path) with Demucs fallback.
- 4-stem speed uses:
  1) SCNet (when enabled and healthy), then
  2) Demucs speed lane from rank folders.
- **Fast 4-stem policy:** rank 28 only (no speed fallback checkpoint).
- Runtime model root is `server_models` when `STEM_MODELS_DIR=server_models`.

---

## ONNX in Active Pipeline

### 2-stem

- Active ONNX models are selected from tiered lists in `stem_service/mdx_onnx.py`.
- `.ort` is preferred over `.onnx` when both exist.
- Typical fast/balanced vocal path uses:
  - `UVR_MDXNET_3_9662`
  - fallback `UVR_MDXNET_KARA`
- Quality vocal path uses:
  - `Kim_Vocal_2`
  - fallback `Kim_Vocal_1`

### 4-stem

- SCNet ONNX path is optional (`FOUR_STEM_BACKEND=auto` + model/runtime availability).
- If SCNet is skipped/unavailable/fails, pipeline uses Demucs subprocess.
- Current speed mapping uses only:
  - `speed_4stem_rank28/cfa93e08-61801ae1.th`

---

## Efficiency Implications

- ONNX remains the efficiency path for Stage-1/2-stem operations.
- 4-stem Demucs is still PyTorch subprocess execution.
- Removing speed fallback reduces branching and makes model behavior deterministic for fast 4-stem.

---

## Canonical References

- Runtime routing: `docs/stem-pipeline.md`
- Current model/path policy: `docs/MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md`
- Authoritative model mapping code:
  - `stem_service/config.py`
  - `stem_service/split.py`
  - `stem_service/mdx_onnx.py`
