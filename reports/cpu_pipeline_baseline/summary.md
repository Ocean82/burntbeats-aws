# CPU Pipeline Baseline

**Historical run (pre-2026-06-03 remap):** The table below used `Kim_Vocal_2` for quality/speed vocal paths. Production now routes **quality** vocal through `UVR_MDXNET_KARA` and **4-stem full separation** through `mdx_4stem` when stem ONNX weights are present. Demucs fallback uses **shifts=0** for both tiers on CPU.

**Re-benchmark:** Run `scripts/t3-large-benchmark.sh` on a t3.large host after deploy to refresh RTF numbers. SLA targets (30s clip): speed RTF ≤ 1.2 (~36s), quality RTF ≤ 2.0 (~60s).

Input clip (original run): `C:\Users\sammy\OneDrive\Desktop\benchmark_out\input_30s.wav`  
Clip duration: `30.0s`  
CPU budget: `STEM_CPU_WORKERS=1`, `STEM_CPU_THREADS=2`, `STEM_CPU_INTEROP_THREADS=1`

## Results (historical — Kim vocal, pre-KARA)

| Mode | Elapsed Seconds | Realtime Factor | Models Used |
| --- | ---: | ---: | --- |
| `2_stem_speed` | `99.09` | `3.3031` | `Kim_Vocal_2.ort`, `phase_inversion` |
| `2_stem_quality` | `183.38` | `6.1125` | `Kim_Vocal_2.ort`, `phase_inversion` |
| `4_stem_speed` | `123.14` | `4.1047` | `Kim_Vocal_2.ort`, `phase_inversion`, `htdemucs` |
| `4_stem_quality` | `194.64` | `6.4880` | `Kim_Vocal_2.ort`, `phase_inversion`, `htdemucs` |

## Expected production paths (2026-06-04 policy)

| Mode | Vocal / 4-stem routing | Demucs shifts when fallback |
| --- | --- | --- |
| `2_stem_speed` | `UVR_MDXNET_3_9662` | N/A (hybrid_2 ONNX) |
| `2_stem_quality` | `UVR_MDXNET_KARA` | N/A |
| `4_stem_*` | `mdx_4stem` when drum/bass/other ONNX on disk | `0` (speed and quality) |

## Artifacts

- Raw metrics JSONL: `reports/cpu_pipeline_baseline/pipeline_metrics.jsonl`
- Raw metrics CSV: `reports/cpu_pipeline_baseline/pipeline_metrics.csv`
- Per-run outputs: `reports/cpu_pipeline_baseline/<mode>/<job-id>/`
- Appended job-style metrics: `job_metrics.jsonl`

## Notes

- Historical benchmark predates queue depth `MAX_QUEUE_DEPTH=5` and frontend `jobs_ahead` copy.
- Re-run on t3.large to validate SLA after KARA remap and Demucs shifts=0.
