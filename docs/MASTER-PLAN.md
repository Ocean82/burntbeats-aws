# Master plan — models, repo cleanup, and tiers

This document captures the phased roadmap for cleaning the repository, grounding model choice in **elapsed time + subjective score** (not blended formulas), aligning code tier lists with benchmarks, moving 4-stem Demucs to PyTorch weights only, and consolidating per-model parameters.

**Suggested order of execution:** Phase 1 → Phase 2 (rules + CSV as canonical) → Phase 3 (tiers vs CSV) → Phase 4 (Demucs ONNX/ORT removal) → Phase 5 (params).

---

## How the old “math” worked (optional context)

`scripts/rank_model_matrix.py` builds **`tmp/model_matrix_benchmark/ranked_score_time.csv`** by sorting primarily by **effective score** (high first), then **elapsed** (low second).

**`ranked_blended_q80_s20.csv`** adds:

- `quality_norm = score / 10`
- `speed_norm = min_elapsed / elapsed`
- `blended = 0.8 * quality_norm + 0.2 * speed_norm`

That blended ordering can feel “jumpy” compared to prioritizing **fast runs with score 9**. For product decisions, prefer **raw score + elapsed** on a fixed clip (e.g. 30s). Use blended only if you explicitly want a research composite.

---

## Phase 1 — Repo cleanup (top priority)

| Step | Action |
|------|--------|
| 1a | Audit **`docs/`**, **`tmp/`**, **`scripts/`** for duplicate or obsolete content; move uncertain material to **`docs/archive/`**. |
| 1b | **Models on disk:** remove weights you will never ship (backups exist); optionally **dedupe** between `models/` root and `MDX_Net_Models/` / `mdxnet_models/`. |
| 1c | Fix **scripts** that still reference removed Demucs ONNX paths (e.g. `probe_onnx.py`, `inspect_demucs_onnx.py`, `convert_all_onnx_to_ort.py` excludes). |

**Status (2026-04):** **1a / docs:** `benchmark-demucs-onnx.md` superseded; full text **archived** to `docs/archive/benchmark-demucs-onnx.md`. Stale **Demucs ONNX** references trimmed in CPU / ORT / README / inventory / NEW-flow / new_features / MODELS-NEW / ONNX-EFFICIENCY / OPENVINO. **`tmp/`** remains gitignored — workflow described in **`docs/model-matrix-benchmark-workflow.md`**. **1b** — **`docs/MODELS-DISK-CLEANUP.md`** + **`scripts/dedupe_models_onnx.py`** (dry-run / `--apply`); redundant same-hash copies under `mdxnet_models/` / `MDX_Net_Models/` removed when `models/` root holds the file. **1c** done earlier in code pass.

---

## Phase 2 — CSV and selection rules

| Step | Action |
|------|--------|
| 2a | Treat **`docs/ranked_practical_time_score.csv`** as the canonical **human** table (tier, role, model, backend, score, elapsed, notes). Copy from `tmp/` after matrix runs if you regenerate locally. |
| 2b | Deprecate relying on **`ranked_blended_q80_s20.csv`** for tier decisions (keep for research or archive). |
| 2c | **Defaults:** prefer **score ≥ 9**; allow **8.5** only for fast **`UVR_MDXNET_*`** runs (~26–29s on the reference 30s clip); avoid slow models unless explicitly choosing a “quality” tier. |

**Status (2026-04):** **`docs/ranked_practical_time_score.csv`** added; **`docs/MODEL-SELECTION-AUTHORITY.md`** rewritten around score+time; **`stem_service/mdx_onnx.py`** tier comment block updated; **`scripts/rank_model_matrix.py`** documents the split between generated vs human CSVs.

---

## Phase 3 — Tier lists vs CSV

| Step | Action |
|------|--------|
| 3a | Align **`stem_service/mdx_onnx.py`** (`_VOCAL_TIER_NAMES`, `_INST_TIER_NAMES`) with **`ranked_practical_time_score.csv`** and the speed/score cutoffs above. |
| 3b | Keep **`docs/MODEL-SELECTION-AUTHORITY.md`** (or one chosen doc) in sync as the **single written source** that matches code. |

---

## Phase 4 — Demucs `.onnx` / `.ort` out; `.pth` / `.th` in

| Step | Action |
|------|--------|
| 4a | **Runtime:** 4-stem path = **SCNet (if present) → PyTorch Demucs** using **`htdemucs.pth`** / **`htdemucs.th`** — no Demucs ONNX/ORT for production. |
| 4b | **Code:** remove or fence **`stem_service/demucs_onnx.py`** and **`hybrid.py`** / **`server.py`** branches that call it; update docs that still describe embedded/6s ONNX exports. |

**Status:** `demucs_onnx.py` removed; `hybrid.py`, `server.py`, and benchmark scripts updated. Intentional mentions remain in **`docs/ranked_practical_time_score.csv`** (exclude row), **`docs/archive/`**, and benchmark stub scripts — historical context only.

---

## Phase 5 — Per-model parameters

| Step | Action |
|------|--------|
| 5a | Primary locations: **`models/MDX_Net_Models/model_data/model_data.json`**, **`models/mdxnet_models/model_data.json`**, and UVR-style **`model_resources`** JSON (segment size, overlap, `n_fft`, etc.). |
| 5b | Decide whether **`mdx_onnx.py`** hardcoded tuples remain, or a single loader reads **model_data** (or a slim override file) so optimized params live in one place. |

**Status:** **Hardcoded `_MDX_CONFIGS` remains authoritative** for inference (tensor shapes + compensate). **`docs/MODEL-PARAMS.md`** documents UVR field mapping (including that **`mdx_dim_t_set` ≠ tensor `dim_t`**) and overlap from **`vocal_stage1.py`**. **`stem_service/mdx_model_params.py`** optionally merges hash-keyed JSON for tooling when `models/` is present. Public lookup: **`mdx_config_for_logical_onnx_name()`** in **`mdx_onnx.py`**.

---

## Extra items

- **`tmp/`:** large benchmark outputs stay gitignored; see **`docs/model-matrix-benchmark-workflow.md`** for `summary.csv` → `rank_model_matrix.py` → **`docs/ranked_practical_time_score.csv`**.
- **Reverb, MDX23C, RoFormer:** treat as **separate roles** (post-pass, slow quality, ultra) so they do not pollute “2-stem vocal fast” rankings.

---

## Related paths

| Artifact | Path |
|----------|------|
| Benchmark input | `tmp/model_matrix_benchmark/summary.csv` |
| Rank script | `scripts/rank_model_matrix.py` |
| Score + time ranking | `tmp/model_matrix_benchmark/ranked_score_time.csv` |
| Blended (research) | `tmp/model_matrix_benchmark/ranked_blended_q80_s20.csv` |
| Practical (human, tracked) | `docs/ranked_practical_time_score.csv` |
| Benchmark flow (tmp + rank) | `docs/model-matrix-benchmark-workflow.md` |
| Local models disk hygiene | `docs/MODELS-DISK-CLEANUP.md` |
