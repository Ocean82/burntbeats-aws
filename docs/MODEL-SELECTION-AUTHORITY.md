# Model Selection Authority

> **Single source of truth for model tier assignments.**
> Do not change `_VOCAL_TIER_NAMES` or `_INST_TIER_NAMES` in `stem_service/mdx_onnx.py`
> without updating this file.

---

## MDX numeric parameters (n_fft, overlap, etc.)

Tier lists below are **names only**. For **`n_fft` / `dim_f` / `dim_t` / `compensate`** and how they relate to UVR `model_data.json`, see **[`MODEL-PARAMS.md`](MODEL-PARAMS.md)**.

---

## Canonical benchmark (score + time)

**File (tracked in git):** [`docs/ranked_practical_time_score.csv`](ranked_practical_time_score.csv)

- **Clip:** 30s (same as `scripts/run_model_matrix_benchmark.py` / matrix runs).
- **Scores:** Parsed from per-run `sound-quality.md` / `sound-qulaity.md` under `tmp/model_matrix_benchmark/<case>/` (see `scripts/rank_model_matrix.py`).
- **Decision rule:** Prefer **subjective score ≥ 9** and **low `elapsed_sec`** on that clip. Treat **8.5** as acceptable only for **fast** `UVR_MDXNET_*` rows (~26–29s). Do **not** use blended `quality_norm`/`speed_norm` math for product decisions unless you explicitly want a research composite.

**Tiers in the CSV:**

| CSV `tier` | Meaning |
|------------|---------|
| `recommended_fast` | Score 9 + fast elapsed (vocal MDX numbered/KARA, or Inst_HQ_5) |
| `recommended_8_5_fast` | Score 8.5 but same speed class as fast UVR_MDXNET_* |
| `quality_slower` | Score 9+ but slower (Kim_Vocal_*, Voc_FT, Inst_HQ_4) |
| `slow_pair` | mdx23c (quality experiments, not fast tier) |
| `special_*` | Reverb — not comparable to 2-stem vocal ranking |
| `exclude` | Do not use for default paths |

ORT is still **auto-preferred** at runtime via `resolve_mdx_model_path()` when a `.ort` sibling exists; tier **lists use `.onnx` names**.

---

## Tier assignments (must match `stem_service/mdx_onnx.py`)

Lists below are **logical ONNX names**; runtime resolves to `.ort` when present.

### Vocal

| Mode | Order (try first → last) |
|------|---------------------------|
| **fast / balanced** | `UVR_MDXNET_3_9662` → `UVR_MDXNET_KARA` → `UVR_MDXNET_2_9682` → `UVR_MDXNET_1_9703` |
| **quality** | `UVR_MDXNET_3_9662` → `UVR_MDXNET_KARA` → `Kim_Vocal_1` → `Kim_Vocal_2` → `UVR-MDX-NET-Voc_FT` |

Fast tier uses **8.5** models (`UVR_MDXNET_1/2`) only in the **numbered MDX** family where the benchmark showed **~26–29s** on the 30s clip. Quality tier prioritizes **9** models that are slower (Kim / Voc_FT) after the fast 9s.

### Instrumental

| Mode | Order |
|------|--------|
| **fast / balanced** | `UVR-MDX-NET-Inst_HQ_5` |
| **quality** | `UVR-MDX-NET-Inst_HQ_5` → `UVR-MDX-NET-Inst_HQ_4` |

---

## How to update after a new matrix run

1. Run the matrix benchmark (produces `tmp/model_matrix_benchmark/summary.csv`).
2. Run `python scripts/rank_model_matrix.py` → updates `ranked_score_time.csv` and `ranked_blended_q80_s20.csv` under `tmp/` (if writable).
3. Refresh **`docs/ranked_practical_time_score.csv`** by hand (or script) from scores + elapsed — this is the **human** source of truth.
4. Adjust `_VOCAL_TIER_NAMES` / `_INST_TIER_NAMES` in `mdx_onnx.py` and this doc so they stay aligned.

---

## Legacy: blended benchmark (research only)

The following was used for an earlier **blended** ordering (`quality_norm * 0.8 + speed_norm * 0.2`). It remains for comparison; **do not** treat it as the primary tier driver.

**Files:** `tmp/model_matrix_benchmark/ranked_blended_q80_s20.csv` (generated; may need regenerate from `summary.csv`).

### Hard cutoffs (legacy table)

| Metric | Cutoff |
|--------|--------|
| `speed_norm` | < 0.30 → excluded |
| `score_num` | < 8.5 → excluded |
| `blended_score` | < 0.75 → excluded |
| `relabeled_from_mismatch` | true → excluded |

### Eligibility snapshot (2026-03-22) — vocal (blended era)

| rank | model | blended | notes |
|------|-------|---------|------|
| 1–4 | UVR_MDXNET_3_9662 / KARA (ort/onnx) | 0.867–0.883 | fast |
| 5–8 | UVR_MDXNET_2 / 1 (8.5 family) | 0.832–0.846 | fast |
| 9 | Voc_FT.onnx | 0.819 | failed legacy speed_norm cutoff — still valid for **quality** tier by score |
| 16–23 | Kim_Vocal_* / Voc_FT.ort | 0.781–0.787 | quality tier |

### Instrumental (blended era)

| rank | model | blended |
|------|-------|---------|
| 10–11 | Inst_HQ_5 | ~0.80 |
| 15–19 | Inst_HQ_4 | ~0.786–0.788 |

---

## Related

- [`MASTER-PLAN.md`](MASTER-PLAN.md) — phased cleanup and roadmap.
- [`stem-pipeline.md`](stem-pipeline.md) — runtime routing (SCNet, PyTorch Demucs, MDX).
