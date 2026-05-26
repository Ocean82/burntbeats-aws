# CPU Pipeline Baseline

Input clip: `C:\Users\sammy\OneDrive\Desktop\benchmark_out\input_30s.wav`  
Clip duration: `30.0s`  
CPU budget: `STEM_CPU_WORKERS=1`, `STEM_CPU_THREADS=2`, `STEM_CPU_INTEROP_THREADS=1`

## Results

| Mode | Elapsed Seconds | Realtime Factor | Models Used |
| --- | ---: | ---: | --- |
| `2_stem_speed` | `99.09` | `3.3031` | `Kim_Vocal_2.ort`, `phase_inversion` |
| `2_stem_quality` | `183.38` | `6.1125` | `Kim_Vocal_2.ort`, `phase_inversion` |
| `4_stem_speed` | `123.14` | `4.1047` | `Kim_Vocal_2.ort`, `phase_inversion`, `htdemucs` |
| `4_stem_quality` | `194.64` | `6.4880` | `Kim_Vocal_2.ort`, `phase_inversion`, `htdemucs` |

## Artifacts

- Raw metrics JSONL: `reports/cpu_pipeline_baseline/pipeline_metrics.jsonl`
- Raw metrics CSV: `reports/cpu_pipeline_baseline/pipeline_metrics.csv`
- Per-run outputs: `reports/cpu_pipeline_baseline/<mode>/<job-id>/`
- Appended job-style metrics: `job_metrics.jsonl`

## Notes

- The benchmark used the deterministic CPU-only paths introduced by this refactor.
- `4_stem_speed` is materially slower than `2_stem_speed`, but still substantially faster than `4_stem_quality`.
- `2_stem_quality` and `4_stem_quality` currently land in a similar RTF band on this host, so future optimization work should focus on the shared quality-path costs first.
