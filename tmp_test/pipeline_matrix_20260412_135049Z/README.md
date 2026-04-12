# Pipeline sample matrix  (20260412_135049Z)
**Matrix wall clock:** 405.214s (2026-04-12T13:50:50.451Z → 2026-04-12T13:57:35.664Z)
**Sum of scenario times:** 380.829s (parallel-capable steps not parallelized here)
Source: `/mnt/d/burntbeats-aws/tmp_test/M.I.A. - Paper airplanes.mp3`
Clip: `/mnt/d/burntbeats-aws/tmp_test/pipeline_matrix_20260412_135049Z/sample_30s.wav` (30.0s)

| ID | Status | Seconds | Start (UTC) | End (UTC) | Models | Notes |
|----|--------|---------|-------------|-----------|--------|-------|
| 01_2stem_fast_main | ok | 15.32 | 2026-04-12T13:50:50.547Z | 2026-04-12T13:51:05.864Z | UVR_MDXNET_3_9662.ort, phase_inversion |  |
| 02_2stem_fast_backup | ok | 13.97 | 2026-04-12T13:51:07.203Z | 2026-04-12T13:51:21.168Z | UVR_MDXNET_KARA.ort, phase_inversion |  |
| 03_2stem_quality_main | ok | 73.40 | 2026-04-12T13:51:22.453Z | 2026-04-12T13:52:35.849Z | mdx23c_vocal.onnx, mdx23c_instrumental.onnx |  |
| 04_2stem_quality_backup | ok | 65.46 | 2026-04-12T13:52:39.425Z | 2026-04-12T13:53:44.887Z | Kim_Vocal_2.ort, phase_inversion |  |
| 05_4stem_fast_main | ok | 60.73 | 2026-04-12T13:53:46.932Z | 2026-04-12T13:54:47.660Z | d12395a8-e57c48e6.th |  |
| 06_4stem_fast_backup | ok | 26.51 | 2026-04-12T13:54:50.785Z | 2026-04-12T13:55:17.295Z | cfa93e08-61801ae1.th |  |
| 07_4stem_quality_main | ok | 33.29 | 2026-04-12T13:55:21.023Z | 2026-04-12T13:55:54.308Z | 04573f0d-f3cf25b2.th |  |
| 08_4stem_quality_backup | ok | 33.73 | 2026-04-12T13:55:57.813Z | 2026-04-12T13:56:31.544Z | 92cfc3b6-ef3bcb9c.th |  |
| 09_scnet_4stem | ok | 58.44 | 2026-04-12T13:56:35.455Z | 2026-04-12T13:57:33.890Z | SCNet-main, scnet.th, scnet_musdb_default.yaml |  |
