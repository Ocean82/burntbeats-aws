# Model Path and Selection Investigation (2026-04-15)

This document is the final state after the model-path and runtime-policy fixes.

---

## Final Runtime State

1. **4-stem speed uses rank 28 only (no speed fallback).**
2. **4-stem quality keeps rank 1 -> rank 2 fallback.**
3. **Runtime model root is `server_models` when `STEM_MODELS_DIR=server_models` is set.**
4. **Demucs checkpoints must use canonical filenames for checksum validation.**

---

## Scope of Investigation

- Code inspection:
  - `stem_service/config.py`
  - `stem_service/server.py`
  - `stem_service/vocal_stage1.py`
  - `stem_service/mdx_onnx.py`
  - `stem_service/split.py`
- Local filesystem inspection:
  - `models/`
  - `models/Demucs_Models/*`
  - `models/models_by_type/th`
  - `server_models/`
- Server filesystem + container inspection:
  - `~/burntbeats-aws/models/*`
  - runtime env inside `stem_service` container

---

## Effective Runtime Configuration (Current)

### Server container

- `MODELS_DIR=/repo/server_models`
- `DEMUCS_EXTRA_MODELS_DIR=/repo/server_models/Demucs_Models`
- `STEM_BACKEND=hybrid`
- `FOUR_STEM_BACKEND=hybrid`
- `DEMUCS_QUALITY_BAG=single`

### Local runtime

- `MODELS_DIR=D:\burntbeats-aws\server_models` when `STEM_MODELS_DIR=server_models`
- Same backend defaults (`hybrid`)

---

## Expected Model Selection by Mode

## 2-stem `speed`

Expected Stage-1 vocal order (`vocal_stage1.py`):

1. `UVR_MDXNET_3_9662.onnx` (or `.ort` preferred if present)
2. `UVR_MDXNET_KARA.onnx` (or `.ort`)
3. Fallback to Demucs 2-stem `htdemucs` if ONNX path fails

Notes:

- `.ort` is preferred over `.onnx` when both exist.
- Instrumental ONNX pass is disabled by default (`USE_TWO_STEM_INST_ONNX_PASS` not enabled), so phase inversion is usually used after vocal extraction.

## 2-stem `quality`

Expected Stage-1 vocal order:

1. `Kim_Vocal_2.onnx` (or `.ort`)
2. `Kim_Vocal_1.onnx` (or `.ort`)
3. Fallback to Demucs 2-stem `htdemucs`

## 2-stem `balanced`

Current behavior:

- `balanced` uses the same vocal lane as fast/balanced speed-first candidates in code where applicable.
- In `server.py`, `balanced` is still a distinct quality mode but maps model tier to `"balanced"`.
- In practice with current tier tables, this still resolves through the fast/balanced ONNX candidates first.

If you plan to add another model for balanced, this is the right place to change:

- `_VOCAL_TIER_NAMES["balanced"]` in `stem_service/mdx_onnx.py`

## 4-stem `speed`

Speed 4-stem runtime mapping (`stem_service/config.py`):

- Primary and only speed checkpoint:
  - `speed_4stem_rank28/cfa93e08-61801ae1.th`
- No speed fallback checkpoint is configured.

Expected output model subdir:

- `.../stage2/cfa93e08/<track>/...`

## 4-stem `quality`

Quality 4-stem runtime mapping:

- rank 1: `quality_4stem_rank1/04573f0d-f3cf25b2__29d4388e.th`
- rank 2 fallback: `quality_4stem_rank2/04573f0d-f3cf25b2__2aad324b.th`

---

## MODEL#28 and MODEL#29 Clarification

From `docs/model-ranking-bigmix.csv`:

- Rank 28 model hash: `cfa93e08-61801ae1__7ae9d6de`
- Rank 29 model hash: `cfa93e08-61801ae1__2aad324b`

For runtime safety, canonical filename `cfa93e08-61801ae1.th` is used in rank folders due to Demucs checksum-name validation behavior.

Final policy decision:

- Speed uses rank 28 only (no speed fallback).

---

## Location Audit Results

## Local `models/models_by_type/th`

- Contains a large set of suffixed and unsuffixed `.th` files, including all four names you listed.
- This directory is a storage/catalog source, **not automatically the direct runtime lookup path for Demucs 4-stem execution**.

## Local active runtime path `server_models/`

- `server_models/Demucs_Models/speed_4stem_rank28/cfa93e08-61801ae1.th`: present
- `server_models/Demucs_Models/speed_4stem_rank29/cfa93e08-61801ae1.th`: present (artifact retained, not used by runtime)
- `server_models/Demucs_Models/quality_4stem_rank1/04573f0d-f3cf25b2__29d4388e.th`: expected
- `server_models/Demucs_Models/quality_4stem_rank2/04573f0d-f3cf25b2__2aad324b.th`: expected

## Server repo runtime path

- Active container root: `/repo/server_models`
- Compose mounts include `./server_models:/repo/server_models`
- `STEM_MODELS_DIR=server_models` is set for `stem_service`

---

## What Not To Do

- Do **not** assume `models/models_by_type/th` files are automatically used by runtime without checking routing code.
- Do **not** mix short-name and suffixed quality-rank files blindly across folders.
- Do **not** point runtime to `server_models/` unless you update compose/env and verify completeness first.
- Do **not** copy multiple variant files into a single rank folder and expect deterministic auto-selection.
- Do **not** re-enable bag/rank folder routing in code without checksum/integrity validation and explicit test coverage.

---

## Operational Rules

- Keep canonical Demucs checkpoint filenames in runtime rank folders.
- Keep exactly one `.th` per active speed rank folder.
- Use `STEM_MODELS_DIR=server_models` consistently across environments.
- If speed fallback is intentionally disabled, keep only rank 28 in `DEMUCS_SPEED_4STEM_CHECKPOINTS`.

---

## Direct Answers (Final)

1. **Are local/server looking in `server_models`?**  
   - **Yes**, when `STEM_MODELS_DIR=server_models` is set (current fixed state).
2. **Is 4-stem speed using rank 28 model?**  
   - **Yes**, via `speed_4stem_rank28/cfa93e08-61801ae1.th`.
3. **Is there speed fallback?**  
   - **No**. Speed fallback is disabled by policy.
4. **Are quality rank1/rank2 still mapped?**  
   - **Yes**, unchanged.

