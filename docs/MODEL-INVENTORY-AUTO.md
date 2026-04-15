# Auto-generated model inventory

**Note (2026-04):** Regenerating this file overwrites content. Rows like `demucs_*` describe **ONNX shape classification** only; **4-stem inference** uses PyTorch Demucs, not Demucs ONNX.

**Generated (UTC):** 2026-03-24T01:21:31Z

**Scanned:** `models` (recursive `*.onnx`)

**Excluded path segments:** `demucs.onnx-main`, `node_modules`, `.git`, `__pycache__` (+ any `--exclude`).

Machine-readable: `tmp/model_inventory.csv`

## Summary counts

- **mdx_dim2048:** 13
- **mdx_dim3072:** 9
- **mdx_dim2560:** 4
- **unknown_shape:** 4
- **demucs_embedded_segment:** 3
- **load_error:** 3
- **demucs_waveform_other_seg:** 2
- **demucs_waveform_symbolic:** 2
- **rank2_input:** 2
- **scnet_like:** 2
- **vad_like:** 1

## Full table

| load | class | ORT | size MB | input0 | path |
|------|-------|-----|---------|--------|------|
| OK | mdx_dim3072 | N | 63.67 | `[batch_size, 4, 3072, 256]` | `models/Kim_Inst.onnx` |
| OK | mdx_dim3072 | N | 63.67 | `[batch_size, 4, 3072, 256]` | `models/Kim_Vocal_1.onnx` |
| OK | mdx_dim3072 | Y | 63.67 | `[batch_size, 4, 3072, 256]` | `models/Kim_Vocal_2.onnx` |
| OK | mdx_dim2560 | N | 56.34 | `[batch_size, 4, 2560, 256]` | `models/MDX_Net_Models/UVR-MDX-NET-Inst_HQ_5.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/MDX_Net_Models/UVR_MDXNET_1_9703.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/MDX_Net_Models/UVR_MDXNET_2_9682.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/MDX_Net_Models/UVR_MDXNET_3_9662.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/MDX_Net_Models/UVR_MDXNET_KARA.onnx` |
| OK | mdx_dim2560 | N | 56.34 | `[batch_size, 4, 2560, 256]` | `models/UVR-MDX-NET-Inst_HQ_5.onnx` |
| OK | mdx_dim3072 | N | 63.67 | `[batch_size, 4, 3072, 256]` | `models/UVR-MDX-NET-Voc_FT.onnx` |
| OK | mdx_dim2560 | N | 56.34 | `[batch_size, 4, 2560, 256]` | `models/UVR-MDX-NET_Crowd_HQ_1.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/UVR_MDXNET_1_9703.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/UVR_MDXNET_2_9682.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/UVR_MDXNET_3_9662.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/UVR_MDXNET_KARA.onnx` |
| OK | unknown_shape | N | 25.02 | `[2, num_splits, 512, 1024]` | `models/accompaniment.int8.onnx` |
| OK | unknown_shape | N | 37.5 | `[2, num_splits, 512, 1024]` | `models/accompaniment.onnx` |
| OK | mdx_dim2048 | N | 50.34 | `[batch_size, 4, 2048, 256]` | `models/best.onnx` |
| FAIL | load_error | N | 4.65 | `` | `models/bs_roformer_ep317_sdr12.9755.onnx` |
| OK | demucs_waveform_other_seg | N | 158.18 | `[1, 801, 4100]` | `models/bs_roformer_ep317_sdr12.9755_quantized_uint8.onnx` |
| OK | rank2_input | N | 40.53 | `[batch_size, decoder_sequence_length]` | `models/decoder_model_merged_quantized.onnx` |
| OK | rank2_input | N | 37.25 | `[batch_size, 1]` | `models/decoder_with_past_model_quantized.onnx` |
| OK | demucs_embedded_segment | N | 234.75 | `[1, 2, 343980]` | `models/demucsv4.onnx` |
| OK | demucs_waveform_symbolic | N | 288.87 | `[batch, 2, time]` | `models/htdemucs.onnx` |
| OK | demucs_waveform_other_seg | Y | 166.41 | `[1, 2, 441000]` | `models/htdemucs2.onnx` |
| OK | demucs_embedded_segment | N | 109.25 | `[1, 2, 343980]` | `models/htdemucs_6s.onnx` |
| OK | demucs_waveform_symbolic | N | 234.64 | `[1, 2, samples]` | `models/htdemucs_6s3.onnx` |
| OK | demucs_embedded_segment | N | 172.17 | `[1, 2, 343980]` | `models/htdemucs_embedded.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/karaoke.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 512]` | `models/kuielab_a_vocals.onnx` |
| OK | mdx_dim2048 | N | 28.33 | `[batch_size, 4, 2048, 256]` | `models/kuielab_b_vocals.onnx` |
| OK | mdx_dim3072 | Y | 63.67 | `[batch_size, 4, 3072, 256]` | `models/mdx23c_instrumental.onnx` |
| OK | mdx_dim3072 | Y | 63.67 | `[batch_size, 4, 3072, 256]` | `models/mdx23c_vocal.onnx` |
| OK | mdx_dim3072 | N | 63.67 | `[batch_size, 4, 3072, 256]` | `models/mdxnet_models/Kim_Vocal_2.onnx` |
| OK | mdx_dim3072 | N | 63.69 | `[batch_size, 4, 3072, 512]` | `models/mdxnet_models/Reverb_HQ_By_FoxJoy.onnx` |
| OK | mdx_dim2560 | N | 56.34 | `[batch_size, 4, 2560, 256]` | `models/mdxnet_models/UVR-MDX-NET-Inst_HQ_4.onnx` |
| OK | mdx_dim3072 | N | 63.67 | `[batch_size, 4, 3072, 256]` | `models/mdxnet_models/UVR-MDX-NET-Voc_FT.onnx` |
| OK | mdx_dim2048 | N | 50.34 | `[batch_size, 4, 2048, 256]` | `models/mdxnet_models/UVR_MDXNET_KARA_2.onnx` |
| FAIL | load_error | N | 172.22 | `` | `models/mel_band_roformer_vocals.onnx` |
| FAIL | load_error | N | 0.0 | `` | `models/scnet.onnx` |
| OK | scnet_like | N | 42.46 | `[batch, 4, 2049, time]` | `models/scnet.onnx/scnet.onnx` |
| OK | scnet_like | N | 21.56 | `[1, 4, 2049, 476]` | `models/scnet_base_fp16.onnx` |
| OK | vad_like | N | 2.22 | `[?, ?]` | `models/silero_vad.onnx` |
| OK | unknown_shape | N | 25.02 | `[2, num_splits, 512, 1024]` | `models/vocals.int8.onnx` |
| OK | unknown_shape | N | 37.5 | `[2, num_splits, 512, 1024]` | `models/vocals.onnx` |

## Notes

- **demucs_embedded_segment** — ONNX segment length class (historical; not used for 4-stem runtime).
- **demucs_waveform_other_seg** (e.g. 441000) will fail until the pipeline is extended for that export.
- **mdx_*** rows need a matching entry in `stem_service/mdx_onnx.py` `_MDX_CONFIGS` to run.
- Re-run after adding ONNX files: `python scripts/scan_models_inventory.py`
