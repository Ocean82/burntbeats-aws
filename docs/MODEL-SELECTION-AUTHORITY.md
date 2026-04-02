# Model Selection Authority

> **Single source of truth for model tier assignments.**
> Do not change `_VOCAL_TIER_NAMES` or `_INST_TIER_NAMES` in `stem_service/mdx_onnx.py`
> without updating this file and re-running benchmarks.

---

## Benchmark source

File: `tmp/model_matrix_benchmark/ranked_blended_q80_s20.csv`
Date: 2026-03-22
Formula: `blended = quality_norm * 0.80 + speed_norm * 0.20`

- `quality_norm` — normalized separation quality score. Higher = better quality.
- `speed_norm` — normalized speed rank relative to all tested models. Higher = faster.
- `blended_score` — combined score. Already accounts for both quality and speed.

---

## Hard cutoffs — fail any one = excluded from all tiers

| Metric | Cutoff | Why |
|--------|--------|-----|
| `speed_norm` | < 0.30 | Slow model |
| `raw score` | < 8.5 | Poor quality |
| `score_num` | < 8.5 | Poor quality |
| `blended_score` | < 0.75 | Poor overall |
| `relabeled_from_mismatch` | true | Raw score is 0 |

---

## Full eligibility check — every model in the benchmark

| rank | model | raw | score_num | speed_norm | blended | eligible |
|------|-------|-----|-----------|-----------|---------|---------|
| 1 | UVR_MDXNET_3_9662.ort | 9.0 | 9.0 | 0.816 | 0.883 | ✅ |
| 2 | UVR_MDXNET_KARA.ort | 9.0 | 9.0 | 0.784 | 0.877 | ✅ |
| 3 | UVR_MDXNET_KARA.onnx | 9.0 | 9.0 | 0.754 | 0.871 | ✅ |
| 4 | UVR_MDXNET_3_9662.onnx | 9.0 | 9.0 | 0.735 | 0.867 | ✅ |
| 5 | UVR_MDXNET_2_9682.ort | 8.5 | 8.5 | 0.832 | 0.846 | ✅ |
| 6 | UVR_MDXNET_1_9703.onnx | 8.5 | 8.5 | 0.825 | 0.845 | ✅ |
| 7 | UVR_MDXNET_1_9703.ort | 8.5 | 8.5 | 0.813 | 0.843 | ✅ |
| 8 | UVR_MDXNET_2_9682.onnx | 8.5 | 8.5 | 0.762 | 0.832 | ✅ |
| 9 | Voc_FT.onnx | 9.5 | 9.5 | **0.293** | 0.819 | ❌ speed_norm < 0.30 |
| 10 | Inst_HQ_5.ort | 9.0 | 9.0 | 0.406 | 0.801 | ✅ |
| 11 | Inst_HQ_5.onnx | 9.0 | 9.0 | 0.402 | 0.800 | ✅ |
| 12 | KARA_2.onnx | **0** | — | — | — | ❌ relabeled |
| 13 | KARA_2.ort | **0** | — | — | — | ❌ relabeled |
| 14 | kuielab_b.ort | 8.0 | **8.0** | — | — | ❌ score_num < 8.5 |
| 15 | Inst_HQ_4.ort | 9.0 | 9.0 | 0.341 | 0.788 | ✅ |
| 16 | Kim_Vocal_1.ort | 9.0 | 9.0 | 0.335 | 0.787 | ✅ |
| 17 | Kim_Inst.ort | **0** | — | — | — | ❌ relabeled |
| 18 | Kim_Vocal_1.onnx | 9.0 | 9.0 | 0.333 | 0.787 | ✅ |
| 19 | Inst_HQ_4.onnx | 9.0 | 9.0 | 0.330 | 0.786 | ✅ |
| 20 | Kim_Vocal_2.ort | 9.0 | 9.0 | 0.324 | 0.785 | ✅ |
| 21 | kuielab_b.onnx | 8.0 | **8.0** | — | — | ❌ score_num < 8.5 |
| 22 | Kim_Vocal_2.onnx | 9.0 | 9.0 | 0.307 | 0.782 | ✅ |
| 23 | Voc_FT.ort | 9.0 | 9.0 | 0.304 | 0.781 | ✅ |
| 24 | kuielab_a.onnx | 8.0 | **8.0** | — | — | ❌ score_num < 8.5 |
| 25 | kuielab_a.ort | 8.0 | **8.0** | — | — | ❌ score_num < 8.5 |
| 26 | mdx23c.onnx | 9.0 | 9.0 | **0.180** | 0.756 | ❌ speed_norm < 0.30 |
| 27 | mdx23c.ort | 9.0 | 9.0 | **0.165** | 0.753 | ❌ speed_norm < 0.30 |
| 28+ | all others | ≤2 or raw=0 | — | — | — | ❌ |

---

## Eligible vocal models (all cutoffs pass)

| rank | model | quality_norm | speed_norm | blended | tier |
|------|-------|-------------|-----------|---------|------|
| 1 | UVR_MDXNET_3_9662.ort | 0.90 | 0.816 | 0.883 | fast |
| 2 | UVR_MDXNET_KARA.ort | 0.90 | 0.784 | 0.877 | fast |
| 3 | UVR_MDXNET_KARA.onnx | 0.90 | 0.754 | 0.871 | fast |
| 4 | UVR_MDXNET_3_9662.onnx | 0.90 | 0.735 | 0.867 | fast |
| 5 | UVR_MDXNET_2_9682.ort | 0.85 | 0.832 | 0.846 | fast |
| 6 | UVR_MDXNET_1_9703.onnx | 0.85 | 0.825 | 0.845 | fast |
| 7 | UVR_MDXNET_1_9703.ort | 0.85 | 0.813 | 0.843 | fast |
| 8 | UVR_MDXNET_2_9682.onnx | 0.85 | 0.762 | 0.832 | fast |
| 16 | Kim_Vocal_1.ort | 0.90 | 0.335 | 0.787 | quality |
| 18 | Kim_Vocal_1.onnx | 0.90 | 0.333 | 0.787 | quality |
| 20 | Kim_Vocal_2.ort | 0.90 | 0.324 | 0.785 | quality |
| 22 | Kim_Vocal_2.onnx | 0.90 | 0.307 | 0.782 | quality |
| 23 | Voc_FT.ort | 0.90 | 0.304 | 0.781 | quality |

## Eligible instrumental models (all cutoffs pass)

| rank | model | quality_norm | speed_norm | blended | tier |
|------|-------|-------------|-----------|---------|------|
| 10 | Inst_HQ_5.ort | 0.90 | 0.406 | 0.801 | fast + quality |
| 11 | Inst_HQ_5.onnx | 0.90 | 0.402 | 0.800 | fast + quality |
| 15 | Inst_HQ_4.ort | 0.90 | 0.341 | 0.788 | quality |
| 19 | Inst_HQ_4.onnx | 0.90 | 0.330 | 0.786 | quality |

---

## Tier assignments (exact code in `stem_service/mdx_onnx.py`)

ORT is auto-preferred at runtime via `resolve_mdx_model_path()`. Lists use `.onnx` names.

### Vocal

```
fast / balanced  (highest blended from eligible pool):
  1. UVR_MDXNET_3_9662.onnx   blended=0.883  quality=0.90  speed=0.816
  2. UVR_MDXNET_KARA.onnx     blended=0.877  quality=0.90  speed=0.784
  3. UVR_MDXNET_2_9682.onnx   blended=0.846  quality=0.85  speed=0.832
  4. UVR_MDXNET_1_9703.onnx   blended=0.845  quality=0.85  speed=0.825

quality  (quality_norm=0.90 eligible models, ordered by blended):
  1. UVR_MDXNET_3_9662.onnx   blended=0.883  quality=0.90
  2. UVR_MDXNET_KARA.onnx     blended=0.877  quality=0.90
  3. Kim_Vocal_1.onnx         blended=0.787  quality=0.90
  4. Kim_Vocal_2.onnx         blended=0.785  quality=0.90
  5. UVR-MDX-NET-Voc_FT.onnx  blended=0.781  quality=0.90  (resolves to .ort at runtime)
```

### Instrumental

```
fast / balanced:
  1. UVR-MDX-NET-Inst_HQ_5.onnx  blended=0.801  quality=0.90  speed=0.406

quality:
  1. UVR-MDX-NET-Inst_HQ_5.onnx  blended=0.801  quality=0.90  speed=0.406
  2. UVR-MDX-NET-Inst_HQ_4.onnx  blended=0.788  quality=0.90  speed=0.341
```

---

## Note on stem count and speed scores

All models in this benchmark were tested on the same 30s clip doing 2-stem separation. The speed differences are purely model weight/complexity, not stem count. The cutoffs apply fairly across all models.

---

## How to update

1. Run: `python scripts/run_model_matrix_benchmark.py`
2. Check `tmp/model_matrix_benchmark/ranked_blended_q80_s20.csv`
3. Apply the four cutoffs to every row
4. Update `_VOCAL_TIER_NAMES` and `_INST_TIER_NAMES` in `stem_service/mdx_onnx.py`
5. Update the eligibility table and tier assignments in this file
6. Update the README summary table
