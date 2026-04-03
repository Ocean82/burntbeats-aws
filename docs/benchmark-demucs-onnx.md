# Demucs ONNX benchmarks vs production processing

## Should we use `tmp/_bench_shape_guard_test/` (or similar) to process ONNX models?

**No.** Folders like `tmp/_bench_shape_guard_test/` are **throwaway output** from a developer run of `scripts/benchmark_demucs_onnx_4stem.py` (or a manual `--out tmp/_bench_shape_guard_test`). They exist to:

- Verify ONNX files **load** and match **Demucs-style** graph shape (`_looks_like_demucs_waveform_model`)
- Optionally measure **wall time** per model
- Produce stems for a **single input WAV** (often a **1–4 second smoke clip** — not valid for quality judgment)

They are **not** a separate “ONNX processing service” and should not be wired into production.

## What actually processes ONNX in production

| Concern | Where it lives |
|--------|----------------|
| 4-stem Demucs ONNX (embedded / 6s, routing) | `stem_service/demucs_onnx.py` → called from `stem_service/hybrid.py` / `stem_service/server.py` |
| SCNet, MDX, etc. | Other modules under `stem_service/` per job mode |

API jobs write under `tmp/stems/<job-id>/` (when configured), not under `_bench_*`.

## When to run the benchmark script

Use **`scripts/benchmark_demucs_onnx_4stem.py`** only for:

- **CI / local smoke**: “Does this `.onnx` load and run?”
- **Comparing timings** between candidate Demucs ONNX files on a **long enough** musical clip (e.g. **≥ 15–30 seconds** of real content)

Pass a real clip:

```bash
python scripts/benchmark_demucs_onnx_4stem.py --input path/to/song.wav --out tmp/demucs_onnx_benchmark_manual
```

Avoid using `tmp/test_split.wav` (often **~1 s**) or other **≤4.5 s** inputs for quality conclusions; reports mark those as `smoke_test_only` in `BENCHMARK_REPORT.json`.

## Artifacts

Each benchmark run writes: *find the reports that compare onnx and ort models there are scoresheets and best models to use listed*

- `BENCHMARK_REPORT.json` — per-model results, `audio_duration_seconds`, `smoke_test_only` when applicable
- `BENCHMARK_SUMMARY.txt` — human-readable copy

Regenerating `tmp/job_matrix.csv` does **not** include these folders; run `python scripts/summarize_tmp_jobs.py` to refresh stem-job matrices **and** `tmp/benchmark_runs.csv` (index of benchmark reports under `tmp/`).
