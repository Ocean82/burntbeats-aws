# MDX-Net parameters (runtime vs UVR `model_data`)

This doc ties together **where separation settings live** in this repo and how they relate to **Ultimate Vocal Remover (UVR)** `model_data.json` exports.

## Authority for inference

| What | Source |
|------|--------|
| **STFT / chunk shapes** (`n_fft`, `hop_length`, `dim_f`, `dim_t`) | **`stem_service/mdx_onnx.py`** → `_MDX_CONFIGS`, keyed by **logical `*.onnx` filename** (same config applies to a sibling `.ort`). Values are derived from **probed ONNX input tensor shapes** (`scripts/probe_onnx.py`) and checked against UVR fields where they align. |
| **Amplitude compensate** (`compensate`) | Same tuple’s last element — taken from UVR `model_data` when available, kept in lockstep with `_MDX_CONFIGS`. |
| **Chunk overlap** (inference stitching) | **Not** in `model_data.json`. Set in **`stem_service/vocal_stage1.py`**: `prefer_speed=True` → 50% overlap (`0.5`); else 75% (`0.75`). Quality tier additionally forces 50% overlap for MDX ONNX when `prefer_speed` is false (CPU latency). |

If `models/` is missing locally, inference still uses the built-in table; optional JSON loading is for tooling and cross-checks only (`stem_service/mdx_model_params.py`).

---

## Stage 1 return value and `InstrumentalSource`

`extract_vocals_stage1(...)` returns a **4-tuple**:

`(vocals_path, instrumental_path | None, models_used, instrumental_source)`.

`instrumental_source` is an **`InstrumentalSource`** enum (`stem_service/vocal_stage1.py`). It removes ambiguity: a `None` instrumental path only means “hybrid must still subtract” when the source is **`PHASE_INVERSION_PENDING`**.

| `InstrumentalSource` | `instrumental_path` | Hybrid behavior (`stem_service/hybrid.py`) |
|----------------------|---------------------|---------------------------------------------|
| `PHASE_INVERSION_PENDING` | `None` | `_materialize_stage1_instrumental` → `create_perfect_instrumental` (aligned mix − vocal). |
| `MDX23C_MIX_MINUS` | WAV path | Copy; stem already written as mix − vocal inside `mdx_onnx` (single `mdx23c_vocal` pass). |
| `ONNX_SEPARATE_INST` | WAV path | Copy; from a second instrumental ONNX (e.g. Inst HQ, `mdx23c_instrumental`). |
| `DEMUCS_TWO_STEM` | `no_vocals` path | Copy; model-native Demucs stem. |
| `AUDIO_SEPARATOR` | WAV path | Copy; from audio-separator CLI. |

**Backward compatibility:** `unpack_stage1_legacy(quad)` returns the first three fields only.

---

## UVR JSON locations (reference copies)

| Path | Role |
|------|------|
| `models/MDX_Net_Models/model_data/model_data.json` | Hash-keyed entries; often the fuller UVR bundle. |
| `models/MDX_Net_Models/model_data/model_name_mapper.json` | Maps **internal model id** (e.g. `Kim_Vocal_1`, `UVR_MDXNET_3_9662`) to **human display name** — not a hash→filename map. |
| `models/mdxnet_models/model_data.json` | Another hash-keyed copy (may overlap; same field names). |

Entries look like:

```json
{
  "abc123...": {
    "compensate": 1.035,
    "mdx_dim_f_set": 3072,
    "mdx_dim_t_set": 8,
    "mdx_n_fft_scale_set": 6144,
    "primary_stem": "Vocals"
  }
}
```

---

## Field mapping (UVR name → `mdx_onnx` tuple)

Runtime tuple: **`(n_fft, hop_length, dim_f, dim_t, compensate)`**.

| UVR / JSON field | Maps to | Notes |
|------------------|---------|--------|
| `mdx_n_fft_scale_set` | **`n_fft`** | Should satisfy `n_fft // 2 + 1 >= dim_f`. |
| *(implicit in UVR)* | **`hop_length`** | **1024** for all MDX-Net models in this codebase — not `n_fft // 2`. |
| `mdx_dim_f_set` | **`dim_f`** | Frequency bins consumed by the network (first `dim_f` bins of the STFT magnitude pipeline). |
| `mdx_dim_t_set` | **Not** `dim_t` | UVR uses small integers (often **7–9**) for **segment / overlap policy** in the desktop app. Our **`dim_t`** is the **tensor width** (time bins in the fixed input), typically **256** or **512** — from **ONNX input shape**, not from this JSON field. Do not copy `mdx_dim_t_set` into `dim_t`. |
| `compensate` | **`compensate`** | Post–iSTFT gain correction. |
| `primary_stem` | *(metadata)* | Vocals vs Instrumental vs Reverb — used for model choice, not the numeric tuple. |

---

## Built-in `_MDX_CONFIGS` snapshot (logical ONNX names)

| Logical name | n_fft | hop | dim_f | dim_t | compensate |
|--------------|------:|----:|------:|------:|-----------:|
| `Kim_Vocal_1.onnx` | 6144 | 1024 | 3072 | 256 | 1.035 |
| `Kim_Vocal_2.onnx` | 6144 | 1024 | 3072 | 256 | 1.035 |
| `UVR-MDX-NET-Voc_FT.onnx` | 6144 | 1024 | 3072 | 256 | 1.035 |
| `UVR-MDX-NET-Inst_HQ_4.onnx` | 5120 | 1024 | 2560 | 256 | 1.035 |
| `UVR-MDX-NET-Inst_HQ_5.onnx` | 5120 | 1024 | 2560 | 256 | 1.035 |
| `mdx23c_vocal.onnx` | 6144 | 1024 | 3072 | 256 | 1.035 |
| `mdx23c_instrumental.onnx` | 6144 | 1024 | 3072 | 256 | 1.035 |
| `model_int8.onnx` | 6144 | 1024 | 3072 | 256 | 1.035 |
| `Reverb_HQ_By_FoxJoy.onnx` | 6144 | 1024 | 3072 | **512** | 1.0 |
| `UVR_MDXNET_1_9703.onnx` | 4096 | 1024 | 2048 | 256 | 1.035 |
| `UVR_MDXNET_2_9682.onnx` | 4096 | 1024 | 2048 | 256 | 1.035 |
| `UVR_MDXNET_3_9662.onnx` | 4096 | 1024 | 2048 | 256 | 1.035 |
| `UVR_MDXNET_KARA.onnx` | 4096 | 1024 | 2048 | 256 | 1.035 |

Tier order for defaults is in **`docs/MODEL-SELECTION-AUTHORITY.md`** (not duplicated here).

---

## Hash keys vs filenames

`model_data.json` keys are **MD5-style hashes** of model weights (UVR-internal). This repo does **not** ship a full **hash → `*.onnx` filename** table. To validate a row against a file you already have, compute the hash UVR uses for that artifact or compare **tensor shapes + compensate** against the table above.

---

## Related code

- `stem_service/mdx_onnx.py` — `_MDX_CONFIGS`, `_get_config`, inference; mix-minus instrumental for `mdx23c_vocal` when `instrumental_output_path` is set.
- `stem_service/vocal_stage1.py` — overlap (`0.5` / `0.75`), `InstrumentalSource`, `extract_vocals_stage1`.
- `stem_service/hybrid.py` — `_materialize_stage1_instrumental` (copy vs phase inversion from enum).
- `stem_service/mdx_model_params.py` — optional merged load of hash-keyed JSON for scripts.
