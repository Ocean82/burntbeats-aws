# CPU Pipeline Baseline

## Post-KARA run (2026-06-06)

Production routing: **quality** vocal → `UVR_MDXNET_KARA` (`.ort` preferred); **speed** vocal → `UVR_MDXNET_3_9662`; **4-stem** → `mdx_4stem` via `kuielab_b` bag when on disk, else `hybrid_4` Demucs fallback; overlap **0.5** for both tiers; Demucs **shifts=0** when fallback runs.

**Benchmark host:** Windows dev machine with t3.large CPU profile (`STEM_CPU_WORKERS=1`, `STEM_CPU_THREADS=2`, `STEM_CPU_INTEROP_THREADS=1`, `USE_GPU=0`, `STEM_MODELS_DIR=server_models`). Re-validate on EC2 t3.large if host OS/threading differs materially.

Input clip: `C:\Users\sammy\OneDrive\Desktop\benchmark_out\input_30s.wav`  
Clip duration: `30.0s`

### Results (post-KARA)

| Mode | Elapsed Seconds | Realtime Factor | Models Used | SLA (30s) |
| --- | ---: | ---: | --- | --- |
| `2_stem_speed` | `22.92` | `0.764` | `UVR_MDXNET_3_9662.ort`, `phase_inversion` | < 40s pass |
| `2_stem_quality` | `23.80` | `0.793` | `UVR_MDXNET_KARA.ort`, `phase_inversion` | < 60s pass |
| `4_stem_speed` | `39.84` | `1.328` | `kuielab_b_*` (4 ONNX) | completes, no `htdemucs` |
| `4_stem_quality` | `38.53` | `1.284` | `kuielab_b_*` (4 ONNX) | completes, no `htdemucs` |

SLA targets: speed RTF ≤ 1.2 (~36s), quality RTF ≤ 2.0 (~60s).

## EC2 t3.large — live container (2026-06-06, pre-Route-1 deploy)

**Host:** `ubuntu@52.0.207.242` — 2 vCPU, 7.6 GiB RAM (t3.large).  
**Container:** `burntbeats-aws-stem_service-1` image from ~6 days ago (`c5710ce`, **37 commits behind** `origin/main`). No `stem_service.routing` module; no `kuielab_b` weights on disk; quality vocal still **Kim_Vocal_2**.

Probe: `scripts/ec2_container_benchmark.py` (legacy hybrid paths) with same thread env as t3.large profile.

| Mode | Elapsed Seconds | Realtime Factor | Models Used | SLA (30s) |
| --- | ---: | ---: | --- | --- |
| `2_stem_speed` | `40.38` | `1.346` | `UVR_MDXNET_3_9662.ort`, `phase_inversion` | borderline (~40s) |
| `2_stem_quality` | `228.85` | `7.629` | `Kim_Vocal_2.ort`, `phase_inversion` | fail |
| `4_stem_speed` | `139.69` | `4.657` | `Kim_Vocal_2.ort`, `phase_inversion`, `htdemucs` | fail |
| `4_stem_quality` | `366.27` | `12.209` | `Kim_Vocal_2.ort`, `phase_inversion`, `htdemucs` | fail |

**Deploy to match dev post-KARA numbers:** pull Route 1 code, rebuild `stem_service` image, sync `server_models/` including `kuielab_b` ONNX + KARA/9662 `.ort`, then re-run `scripts/ec2_container_benchmark.py` (auto-detects intent router when present).

### Router fallback (Phase 0)

When `select_4stem_bag(tier)` returns `None` (no `kuielab_b` or UVR drum/bass+vocal), `full_separation` mode `4` routes to `hybrid_4` with note `routing_fallback:hybrid_4_demucs`. Expand uses the same bag check before MDX stage 2.

**Phase 3b (optional UVR Drum/Bass):** `UVR-MDX-NET-Drum.onnx` / `UVR-MDX-NET-Bass.onnx` are not in the model bank on disk. Fast 4-stem is already served by deployed `kuielab_b` ONNX in `server_models/`. UVR per-stem bag remains optional for future export.

## Historical run (pre-2026-06-03 remap)

The table below used `Kim_Vocal_2` for quality/speed vocal paths and Demucs for 4-stem.

| Mode | Elapsed Seconds | Realtime Factor | Models Used |
| --- | ---: | ---: | --- |
| `2_stem_speed` | `99.09` | `3.3031` | `Kim_Vocal_2.ort`, `phase_inversion` |
| `2_stem_quality` | `183.38` | `6.1125` | `Kim_Vocal_2.ort`, `phase_inversion` |
| `4_stem_speed` | `123.14` | `4.1047` | `Kim_Vocal_2.ort`, `phase_inversion`, `htdemucs` |
| `4_stem_quality` | `194.64` | `6.4880` | `Kim_Vocal_2.ort`, `phase_inversion`, `htdemucs` |

## Artifacts

- Post-KARA metrics JSONL: `reports/cpu_pipeline_baseline/post_kara_2026-06-04/pipeline_metrics.jsonl`
- Post-KARA metrics CSV: `reports/cpu_pipeline_baseline/post_kara_2026-06-04/pipeline_metrics.csv`
- Canonical copy: `reports/cpu_pipeline_baseline/pipeline_metrics.jsonl`
- Per-run outputs: `reports/cpu_pipeline_baseline/post_kara_2026-06-04/<mode>/<job-id>/`

## Notes

- `scripts/track_pipeline_metrics.py` now uses `route_intent` + `execute_plan` for 4-stem (matches `job_worker` production path).
- `/health` with `STEM_MODELS_DIR=server_models`: all four supported modes `ready: true` (`four_stem_bag: kuielab_b`).
- Queue depth `MAX_QUEUE_DEPTH=5` and frontend `jobs_ahead` copy shipped separately (see spec).
- `stem_service/tests/test_mdx_ort_discovery.py` isolation fixed (monkeypatch registry bindings; full suite **113 passed**).
- EC2 re-benchmark script: `scripts/ec2_container_benchmark.py`.
