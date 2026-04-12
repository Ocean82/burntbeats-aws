# Pipeline sample matrix  (20260412_134416Z)
**Matrix wall clock:** 287.017s (2026-04-12T13:44:16.880Z → 2026-04-12T13:49:03.897Z)
**Sum of scenario times:** 275.363s (parallel-capable steps not parallelized here)
Source: `/mnt/d/burntbeats-aws/tmp_test/M.I.A. - Paper airplanes.mp3`
Clip: `/mnt/d/burntbeats-aws/tmp_test/pipeline_matrix_20260412_134416Z/sample_30s.wav` (30.0s)

| ID | Status | Seconds | Start (UTC) | End (UTC) | Models | Notes |
|----|--------|---------|-------------|-----------|--------|-------|
| 01_2stem_fast_main | ok | 13.17 | 2026-04-12T13:44:16.895Z | 2026-04-12T13:44:30.069Z | UVR_MDXNET_3_9662.ort, phase_inversion |  |
| 02_2stem_fast_backup | ok | 12.22 | 2026-04-12T13:44:31.390Z | 2026-04-12T13:44:43.614Z | UVR_MDXNET_KARA.ort, phase_inversion |  |
| 03_2stem_quality_main | ok | 67.70 | 2026-04-12T13:44:44.887Z | 2026-04-12T13:45:52.587Z | mdx23c_vocal.onnx, mdx23c_instrumental.onnx |  |
| 04_2stem_quality_backup | ok | 68.72 | 2026-04-12T13:45:55.797Z | 2026-04-12T13:47:04.517Z | Kim_Vocal_2.ort, phase_inversion |  |
| 05_4stem_fast_main | error | 39.64 | 2026-04-12T13:47:06.495Z | 2026-04-12T13:47:46.135Z | d12395a8-e57c48e6__7ae9d6de.th | Demucs bag (d12395a8) failed: [1mFATAL:[0m Invalid checksum for file /mnt/d/burntbeats-aws/models/Demucs_Models/speed_4stem_rank27/d12395a8-e57c48e6__7ae9d6de.th, expected e57c48e6__7ae9d6de but got e57c48e6b0e38af4f7
 |
| 06_4stem_fast_backup | error | 15.76 | 2026-04-12T13:47:46.626Z | 2026-04-12T13:48:02.384Z | cfa93e08-61801ae1__7ae9d6de.th | Demucs bag (cfa93e08) failed: [1mFATAL:[0m Invalid checksum for file /mnt/d/burntbeats-aws/models/Demucs_Models/speed_4stem_rank28/cfa93e08-61801ae1__7ae9d6de.th, expected 61801ae1__7ae9d6de but got 61801ae1567d606c97
 |
| 07_4stem_quality_main | skipped | - | - | - | - | quality single repo not ready (see DEMUCS_QUALITY_4STEM_* in config) |
| 08_4stem_quality_backup | skipped | - | - | - | - | quality single repo not ready (see DEMUCS_QUALITY_4STEM_* in config) |
| 09_scnet_4stem | ok | 58.15 | 2026-04-12T13:48:04.060Z | 2026-04-12T13:49:02.207Z | SCNet-main, scnet.th, scnet_musdb_default.yaml |  |
