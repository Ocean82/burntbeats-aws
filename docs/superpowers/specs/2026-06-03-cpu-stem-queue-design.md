# CPU Stem Queue & Model Speed Design

**Date:** 2026-06-03  
**Status:** Approved (user review)  
**Environment:** t3.large (2 vCPU / 8 GiB), ~1–2 splits/day, queue depth 4–5 is success

## Problem

Users expect splits in “a few minutes.” On t3.large with default settings, a 30s clip at **quality** takes ~183s (RTF ~6×) because **quality vocal = Kim_Vocal_2** (n_fft 6144) and **4-stem always runs Demucs** on instrumental. Under load, a shared queue with `MAX_QUEUE_DEPTH=20` allows multi-hour waits before 429.

**Product definition (corrected):**

| Tier | Meaning | NOT |
|------|---------|-----|
| **speed** | Fast ONNX path; good enough for DJ/edit use | Slowest / highest-quality models |
| **quality** | Noticeably better than speed | “Best model we have” (Kim_Vocal_2, Demucs shifts=3) |

**Hard SLA (30s reference clip, t3.large):**

- **speed:** RTF ≤ 1.2 (~36s wall time)
- **quality:** RTF ≤ 2.0 (~60s wall time) — **never ~300s on 30s audio**

## Non-goals

- Multi-replica stem services, SQS, autoscaling worker fleets
- Planning for 10+ concurrent users
- Plan-tier queue priority, expand deprioritization (defer unless trivial)
- Heavy observability / alerting stack

## Capacity (t3.large — unchanged)

| Setting | Value |
|---------|-------|
| `STEM_CPU_WORKERS` | `1` |
| `STEM_CPU_THREADS` | `2` |
| Compose `cpus` / `memory` | `2.0` / `6G` |

One heavy job at a time is correct for 2 vCPU.

## Solution 1 — Remap quality vocal to fast ONNX family (primary)

**Change:** Quality tier vocal = **`UVR_MDXNET_KARA.onnx`** (`.ort` preferred), not `Kim_Vocal_2`.

**Rationale:** KARA shares the **4096 n_fft** architecture with `UVR_MDXNET_3_9662` (score-9 family). Kim_Vocal_2 uses **6144 n_fft** — disproportionately slow on CPU. KARA is “better than 9662” without Kim’s cost.

**Files:**

- `stem_service/routing/model_bag.py` — `_VOCAL_TIER_ONNX["high"]`
- `stem_service/mdx/model_registry.py` — `_VOCAL_TIER_NAMES["quality"]` order: KARA first, 9662 fallback; **remove Kim from default quality list**
- `stem_service/vocal_stage1.py` — `_vocal_rank_candidates_for_tier("quality")` → KARA only (9662 fallback if missing)
- `stem_service/server.py` — `/health` required_models for quality tier
- Tests asserting Kim for quality → update to KARA

**Fallback:** None. Each tier uses one fixed ONNX model; missing weights fail fast at job start.

## Solution 2 — ONNX runtime defaults (all tiers)

**Already in place:** `.ort` preferred over `.onnx` via `resolve_mdx_model_path`.

**Enforce / verify:**

- `USE_ONNX_CPU=1`, `USE_INT8_ONNX=0` (INT8 disabled in `.env.example` for quality)
- `STEM_CPU_THREADS=2` propagated to `ONNXRUNTIME_NUM_THREADS`
- Stage 1 overlap on CPU:
  - **speed:** `0.5`
  - **quality:** `0.5` (not `0.75`) — quality difference comes from **model choice**, not extra chunk overlap

**Files:** `stem_service/mdx/inference.py` callers, `vocal_stage1.py`, `routing/pipelines/single_stem.py`

## Solution 3 — 4-stem: ONNX-first, Demucs only when needed

**Current:** `hybrid_4` = Stage 1 vocal ONNX + **Demucs 4-stem** on instrumental (dominates latency).

**Change (when stem ONNX models on disk):**

Route `full_separation` mode `4` through **parallel MDX** when specialized models exist:

- vocals → tier vocal ONNX (9662 / KARA)
- drums → `UVR-MDX-NET-Drum.onnx`
- bass → `UVR-MDX-NET-Bass.onnx`
- other → instrumental via phase inversion or `UVR-MDX-NET-Inst_HQ_5.onnx` as needed

**Router change:** In `routing/router.py`, for `full_separation` + mode `4`, if `_all_specialized(("vocals","drums","bass","other"), tier)` → `parallel_mdx` + vocal job (or new `mdx_4stem` job kind) instead of `hybrid_4`.

**Demucs fallback:** Keep `hybrid_4` only when MDX stem models missing.

**Expand (`/expand`):** Same Stage 2 policy — prefer MDX drums/bass/other on instrumental WAV before Demucs.

**Demucs when unavoidable (speed path):**

- Use **`speed_4stem_rank28`** checkpoint only
- **`shifts=0`** for both speed and quality on CPU (quality = better ONNX upstream, not Demucs shifts=3)
- Do not use `quality_4stem_rank1` + shifts=3 on production CPU

**Files:** `routing/router.py`, `routing/executor.py`, `hybrid/expand.py`, `split.py` (shifts policy), `config/device.py` (document CPU policy)

## Solution 4 — Minimal queue honesty

**Change:**

- `MAX_QUEUE_DEPTH=5` in prod `.env` / compose default
- Expose `jobs_ahead` in progress JSON (derived from `queue_position - 1`)
- 429 response: keep current message; optional `Retry-After: 60`

**Skip for now:** ETA seconds from metrics, expand deprioritization, Prometheus dashboards.

**Files:** `stem_service/config/device.py`, `stem_service/server.py`, `stem_service/job_utils.py`, `.env.example`, `docker-compose.yml`

## Solution 5 — Product copy alignment (light)

- UI / docs: **speed** = “Fast split”, **quality** = “Cleaner split (still quick on CPU)”
- Remove any implication that quality uses “best” or “studio-grade” Kim/Demucs-heavy path
- Expand button: note it adds another queue job (~same time as initial split)

**Files:** Frontend strings in split progress UI; `docs/stem-pipeline.md` if present

## Verification

1. Re-run `scripts/t3-large-benchmark.sh` or 30s clip matrix after model remap
2. Assert 30s **quality** 2-stem wall time **< 60s** on t3.large
3. Assert 30s **speed** 2-stem wall time **< 40s**
4. Assert 4-stem with MDX models on disk does **not** list `htdemucs` in `models_used`
5. Manual: 2 concurrent accepts → second shows `queue_position=2`, no 429 until depth 5

## Implementation order

| Phase | Work | Effort |
|-------|------|--------|
| **1** | Quality vocal → KARA; overlap 0.5 for quality; remove Kim from default quality | Small |
| **2** | Demucs shifts=0 for quality on CPU; speed checkpoint only for 4-stem fallback | Small |
| **3** | 4-stem ONNX router path when stem models present | Medium |
| **4** | `MAX_QUEUE_DEPTH=5`, `jobs_ahead` in progress | Small |
| **5** | UI copy + benchmark regression gate in CI or script | Small |

## Growth trigger (future, not now)

When sustained queue depth > 3 or daily splits > ~10: upgrade to **c6i.xlarge** (4 vCPU), `STEM_CPU_WORKERS=2`, `STEM_CPU_THREADS=2`.
