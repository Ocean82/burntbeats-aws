# Demucs ONNX benchmarks vs production processing (archived)

**Archived:** 2026-04-03 — In-process **Demucs ONNX** (`stem_service/demucs_onnx.py`) was **removed**. Production 4-stem uses **SCNet ONNX** (optional) and **PyTorch Demucs** (`htdemucs.pth` / `htdemucs.th`). See [../stem-pipeline.md](../stem-pipeline.md) and [../MODEL-SELECTION-AUTHORITY.md](../MODEL-SELECTION-AUTHORITY.md).

The text below is preserved for historical context.

---

# Demucs ONNX benchmarks vs production processing

## Should we use `tmp/_bench_shape_guard_test/` (or similar) to process ONNX models?

**No.** Folders like `tmp/_bench_shape_guard_test/` are **throwaway output** from a developer run of `scripts/benchmark_demucs_onnx_4stem.py` (or a manual `--out tmp/_bench_shape_guard_test`). They exist to:

- Verify ONNX files **load** and match **Demucs-style** graph shape (`_looks_like_demucs_waveform_model`)
- Optionally measure **wall time** per model
- Produce stems for a **single input WAV** (often a **1–4 second smoke clip** — not valid for quality judgment)

They are **not** a separate “ONNX processing service” and should not be wired into production.

## What actually processes ONNX in production (historical — pre-2026-04)

| Concern | Where it lived |
|--------|----------------|
| 4-stem Demucs ONNX (embedded / 6s, routing) | ~~`stem_service/demucs_onnx.py`~~ → called from `hybrid.py` / `server.py` |
| SCNet, MDX, etc. | Other modules under `stem_service/` per job mode |

API jobs write under `tmp/stems/<job-id>/` (when configured), not under `_bench_*`.

## When to run the benchmark script

`scripts/benchmark_demucs_onnx_4stem.py` now **exits with an error** explaining that Demucs ONNX benchmarking was retired.

## Artifacts

Each benchmark run writes: *find the reports that compare onnx and ort models there are scoresheets and best models to use listed*

- `BENCHMARK_REPORT.json` — per-model results, `audio_duration_seconds`, `smoke_test_only` when applicable
- `BENCHMARK_SUMMARY.txt` — human-readable copy

Regenerating `tmp/job_matrix.csv` does **not** include these folders; run `python scripts/summarize_tmp_jobs.py` to refresh stem-job matrices **and** `tmp/benchmark_runs.csv` (index of benchmark reports under `tmp/`).
