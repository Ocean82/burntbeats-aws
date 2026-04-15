# Model Path and Selection Investigation (2026-04-15)

This document records a full audit of:

- what the code currently selects for 2-stem and 4-stem modes,
- which model paths are actually used at runtime,
- which files exist locally and on the server,
- what to do and what not to do.

---

## Executive Facts

1. **Current active runtime path for 4-stem is `htdemucs` only** (no Demucs bag/special rank folder loading in active flow).
2. **2-stem model selection is tiered by ONNX/ORT vocal models first**, with Demucs 2-stem fallback.
3. **Server runtime uses `/repo/models`** (bind-mounted from repo `models/`), **not `server_models/`** in current docker-compose.
4. Your listed 4-stem model filenames are valid artifacts in `models_by_type/th`, but **those exact suffixed variants are not what current active 4-stem runtime calls today**.

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

## Effective Runtime Configuration (Observed)

### Server container (live)

- `MODELS_DIR=/repo/models`
- `DEMUCS_EXTRA_MODELS_DIR=/repo/models/Demucs_Models`
- `STEM_BACKEND=hybrid`
- `FOUR_STEM_BACKEND=hybrid`
- `DEMUCS_QUALITY_BAG=single`

### Local code runtime default

- `MODELS_DIR=D:\burntbeats-aws\models` unless `STEM_MODELS_DIR` is explicitly set
- same backend defaults (`hybrid`)

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

**Current active runtime call path**: `run_demucs(..., stems=4)` in `split.py` goes directly through `htdemucs` flow.

- Effective model used now: `htdemucs.th`
- Output path: `.../htdemucs/<track>/{vocals,drums,bass,other}.wav`

## 4-stem `quality`

**Current active runtime call path** is the same as above (`htdemucs` only).

Important:

- Quality/speed 4-stem Demucs rank files exist as artifacts, but active runtime currently does not route to those folder-specific model IDs.

---

## Your Listed 4-stem Model IDs vs Current Runtime

You listed:

- Fast 4-stem: `cfa93e08-61801ae1__7ae9d6de.th`
- Fast 4-stem fallback: `cfa93e08-61801ae1__2aad324b.th`
- Quality 4-stem: `04573f0d-f3cf25b2__29d4388e.th`
- Quality 4-stem fallback: `04573f0d-f3cf25b2__2aad324b.th`

Assessment:

1. These filenames are valid model artifacts for Demucs-family variants.
2. They are present in `models/models_by_type/th` locally.
3. **They are not the filenames currently used in active 4-stem runtime path** after current htdemucs-only policy change.
4. In active `models/Demucs_Models/*` folders, currently observed names are:
   - speed rank28: `cfa93e08-61801ae1.th` (no suffix)
   - quality rank1:
     - local: `04573f0d-f3cf25b2.th` (legacy short-name shape)
     - server: `04573f0d-f3cf25b2__29d4388e.th`
   - quality rank2: `04573f0d-f3cf25b2__2aad324b.th`

---

## Location Audit Results

## Local `models/models_by_type/th`

- Contains a large set of suffixed and unsuffixed `.th` files, including all four names you listed.
- This directory is a storage/catalog source, **not automatically the direct runtime lookup path for Demucs 4-stem execution**.

## Local active runtime path `models/`

- `htdemucs.th`: present
- ONNX top-level files for direct names:
  - direct `.onnx` may be missing at `models/<name>.onnx`,
  - but `.ort` exists under `models/models_by_type/ort/` and resolves correctly.
- `models/Demucs_Models/speed_4stem_rank28/cfa93e08-61801ae1.th`: present
- `models/Demucs_Models/quality_4stem_rank1/04573f0d-f3cf25b2__29d4388e.th`: missing locally (only short name present)

## Local `server_models/`

- Present locally.
- Contains:
  - `Demucs_Models/` with expected rank folders,
  - `models_by_type/onnx`, `models_by_type/ort`,
  - `htdemucs.th`.
- But current compose/runtime is not pointed at this tree.

## Server repo runtime path

- Actual path used by container: `/repo/models` (from `./models:/repo/models` volume).
- `server_models/` directory is not present on the server repo in current deployment.
- Server has key active files present in `/repo/models`, including:
  - `htdemucs.th`
  - ONNX/ORT vocal candidates
  - `Demucs_Models/speed_4stem_rank28/cfa93e08-61801ae1.th`
  - `Demucs_Models/quality_4stem_rank1/04573f0d-f3cf25b2__29d4388e.th`
  - `Demucs_Models/quality_4stem_rank2/04573f0d-f3cf25b2__2aad324b.th`

---

## What Not To Do

- Do **not** assume `models/models_by_type/th` files are automatically used by runtime without checking routing code.
- Do **not** mix short-name and suffixed quality-rank files blindly across folders.
- Do **not** point runtime to `server_models/` unless you update compose/env and verify completeness first.
- Do **not** copy multiple variant files into a single rank folder and expect deterministic auto-selection.
- Do **not** re-enable bag/rank folder routing in code without checksum/integrity validation and explicit test coverage.

---

## What To Do

- Keep current production-safe 4-stem path on `htdemucs` unless you explicitly decide to restore rank-based 4-stem routing.
- If you want your listed suffixed variants to be authoritative, define and enforce a single mapping contract:
  - exact filename,
  - exact folder,
  - exact selector logic in code.
- If moving to `server_models/`, do all of:
  1. set `STEM_MODELS_DIR=server_models` for `stem_service`,
  2. ensure full parity of required files under that tree,
  3. run split smoke tests for 2-stem speed/quality + 4-stem speed/quality.
- For balanced-specific new model planning:
  - update `_VOCAL_TIER_NAMES["balanced"]`,
  - document expected fallback chain,
  - add runtime startup checks and tests.

---

## Direct Answers to the Core Questions

1. **Are local/server looking in `server_models`?**  
   - Current deployed server container: **No**. It uses `/repo/models`.
2. **Are your listed model names present?**  
   - In `models/models_by_type/th` locally: **Yes**.
   - In active server `Demucs_Models/speed_4stem_rank28`: those suffixed `cfa93e08...__7ae9d6de` / `__2aad324b` are **not present**.
3. **Are models in proper location for what is currently called?**  
   - For current active runtime (htdemucs-only 4-stem): **Yes**, because `htdemucs.th` is present and verified.
4. **Are these exact listed models currently being called for 4-stem speed/quality?**  
   - **No**, not with current active htdemucs-only runtime routing.

