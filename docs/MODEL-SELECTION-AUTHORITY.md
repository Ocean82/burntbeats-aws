# Model Selection Authority

> **Single source of truth for model tier assignments.**
> Do not change `_VOCAL_TIER_NAMES` or `_INST_TIER_NAMES` in `stem_service/mdx_onnx.py`
> without updating this file.

---

## Product principle: wall-clock time and throughput

Default model choices are **not** “pick the highest subjective score and ignore runtime.” They are **time-budgeted quality**: the best separation **we are willing to pay for in CPU minutes, queue latency, and daily capacity** on a shared host.

**Why runtime dominates at scale.** Matrix rows are measured on a **30-second** clip, but users upload **full tracks**. Wall time scales roughly with audio length in the same ballpark as the benchmark’s **real-time factor** (elapsed ÷ clip length). A path that needs ~75s for 30s of audio is on the order of **2.5× real time**; a ~4-minute song is then on the order of **many minutes** for that stage alone, before expand, I/O, and contention. At **tens of tracks per day**, a slightly higher score on a 1–10 scale can translate into **hours** of extra machine time and worse perceived responsiveness, for a gain listeners often do not notice in blind comparison—e.g. a **9.5** vs **9** when faster **9**s finish in **~26–29s** on the same clip (**roughly 2–3×** faster). When marginal quality is small and marginal time is large, the slower checkpoint is a **poor default** for a service even if it “wins” a score column.

**What we do instead.** [`ranked_practical_time_score.csv`](ranked_practical_time_score.csv) and the tier tables below encode **joint** judgment: the stem service uses **subjective score ≥ 9** vocal checkpoints only. Rows tagged **`recommended_8_5_fast`** in the CSV are **not** selectable at runtime (same wall-clock class as fast 9s, lower score). **Prefer low `elapsed_sec`** on the reference clip among eligible models. Legacy **blended** scores are **secondary**; see [Legacy: blended benchmark](#legacy-blended-benchmark-research-only).

**Quality is still tuned outside the checkpoint name.** Slower ONNX vocal models are not the only knob. End-user **speed** / **quality** / **ultra** modes (and internal MDX tier usage) still change **overlap, VAD usage, SCNet stride, Demucs bag / shifts**, and related routing—see **[`stem-pipeline.md`](stem-pipeline.md)** (*Quality tiers*). **Fast** and **quality** product modes therefore improve or preserve output through **pipeline parameters and fallbacks**, not only by selecting the slowest high-score MDX export.

---

## MDX numeric parameters (n_fft, overlap, etc.)

Tier lists below are **names only**. For **`n_fft` / `dim_f` / `dim_t` / `compensate`** and how they relate to UVR `model_data.json`, see **[`MODEL-PARAMS.md`](MODEL-PARAMS.md)**.

---

## Canonical benchmark (score + time)

**File (tracked in git):** [`docs/ranked_practical_time_score.csv`](ranked_practical_time_score.csv)

- **Clip:** 30s (same as `scripts/run_model_matrix_benchmark.py` / matrix runs).
- **Scores:** Parsed from per-run `sound-quality.md` / `sound-qulaity.md` under `tmp/model_matrix_benchmark/<case>/` (see `scripts/rank_model_matrix.py`).
- **Decision rule:** **Subjective score ≥ 9** for any vocal path the service may choose; **low `elapsed_sec`** among those. The **8.5** `UVR_MDXNET_1/2` rows are documented in the CSV for comparison only — **not** wired into `mdx_onnx.py` tier lists. Do **not** use blended `quality_norm`/`speed_norm` math for product decisions unless you explicitly want a research composite.

**Tiers in the CSV:**

| CSV `tier` | Meaning |
|------------|---------|
| `recommended_fast` | Score 9 + fast elapsed (vocal MDX numbered/KARA, or Inst_HQ_5) |
| `recommended_8_5_fast` | Score 8.5 (same speed class as fast 9s) — **not used by the stem service** |
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
| **fast / balanced** | `UVR_MDXNET_3_9662` → `UVR_MDXNET_KARA` (score **9** on the benchmark clip only) |
| **quality** | `UVR_MDXNET_3_9662` → `UVR_MDXNET_KARA` → `Kim_Vocal_1` → `Kim_Vocal_2` → `UVR-MDX-NET-Voc_FT` |

**2-stem (production waterfall)** is implemented in **`stem_service/vocal_stage1.py`** (`extract_vocals_stage1`). Order until one succeeds (when `prefer_speed` is false and `model_tier` is **balanced** / **quality**, **MDX23C** is first):

1. **MDX23C rank 0** — **quality:** `mdx23c_vocal` only + mix − vocal in `mdx_onnx` (`InstrumentalSource.MDX23C_MIX_MINUS`). **balanced:** `mdx23c_vocal` + `mdx23c_instrumental` ONNX (`ONNX_SEPARATE_INST`).
2. **UVR_MDXNET_3_9662** (after optional audio-separator branch): vocal ONNX + optional second instrumental ONNX (`USE_TWO_STEM_INST_ONNX_PASS`) or **`PHASE_INVERSION_PENDING`**.
3. **UVR_MDXNET_KARA** — same as (2).
4. **MDX23C rank 3** — same quality/balanced split as (1) if (1) did not return.
5. **PyTorch htdemucs** `--two-stems=vocals` (`DEMUCS_TWO_STEM`).

Return value includes **`InstrumentalSource`** so hybrid never relies on guessing from `instrumental_path is None` alone — see **`docs/MODEL-PARAMS.md`** (*Stage 1 return value*). **`STEM_BACKEND=demucs_only`** skips this entire ONNX waterfall for **2-stem** and uses PyTorch Demucs only (`run_demucs_only_2stem`); tier lists below do not apply there. Tier lists still apply to **instrumental ONNX** selection (`model_tier`) for hybrid ranks 1–2; they do not insert Kim/Voc_FT into this 2-stem chain. **`vocal_model_override`** is rejected if disallowed (see `SERVICE_DISALLOWED_VOCAL_LOGICAL_ONNX` in `mdx_onnx.py`). `SPEED_2STEM_ONNX` is legacy/diagnostic only (see `config.speed_2stem_onnx_path`).

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
