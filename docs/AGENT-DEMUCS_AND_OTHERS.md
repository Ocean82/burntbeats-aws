
###update and investigate this entire page to ensure that e
# Summary: Demucs Model Weights, File Types, Model Manipulation & CPU Info

## Demucs Model Weights & File Types

**Weight file format:** Demucs models use **`.th` (PyTorch state dict)** files. The htdemucs_ft model consists of 4 separate `.th` files — one per stem:
- `f7e0c4bc-ba3fe64a.th` (drums)
- `d12395a8-e57c48e6.th` (bass)
- `92cfc3b6-ef3bcb9c.th` (other)
- `04573f0d-f3cf25b2.th` (vocals)

**Storage location in UVR:** `Ultimate Vocal Remover\models\Demucs_Models\v3_v4_repo`

**Incompatibility note:** Demucs models trained using ZFTurbo's MSST training code produce `.ckpt` files that are **not compatible with UVR** due to a `bag_num` error. They require the ZFTurbo inference code instead. Dry Paint Dealer's Demucs guitar model had this exact problem — "won't work in UVR, as it was trained on MSST, and not the OG code."

**YAML configs:** Each model also needs a `.yaml` configuration file specifying architecture parameters (chunk_size, dims, depth, hop_length, n_fft, etc.).

**Model data files:** UVR uses `model_data.json` and `model_name_mapper.json` in the `model_data` folder to map model hashes to configurations.

---

## Key Math & Formulas

**SDR (Signal-to-Distortion Ratio) — the core quality metric:**
```python
def sdr(reference, estimate):
    delta = 1e-7
    num = np.sum(np.square(reference), axis=(1, 2))
    den = np.sum(np.square(reference - estimate), axis=(1, 2))
    num += delta
    den += delta
    return 10 * np.log10(num / den)
```
SDR is logarithmic — **1 SDR = 10x difference** in signal quality.

**Chunk size ↔ dim_t conversion (for Roformers, hop_length=441):**
```
chunk_size = (dim_t - 1) * hop_length
```
Key values:
| dim_t | chunk_size | Duration |
| ----- | ---------- | -------- |
| 801   | 352,800    | 8.00s    |
| 1101  | 485,100    | 11.00s   |
| 256   | 112,455    | 2.55s    |

**Ensemble math (avg/min/max):**
- **Avg:** Averages STFT spectrograms across models
- **Max:** Takes highest magnitude frequency bins across models (fuller, more bleed)
- **Min:** Takes lowest magnitude bins (cleaner, more filtered)
- For DAW manual averaging: decrease each stem by **3 dB per model** (e.g., 3 models = -9 dB each)

**Volume compensation formula** (for MDX-Net v2 models):
```python
ratio = 10 ** (difference_dBTP / 20)
# where difference = 20 * log10(true_peak_original / true_peak_processed)
```

**Bleedless/fullness metrics:** Based on STFT magnitude comparisons between separated stem and clean reference. Negative diff values = missing content (fullness), positive = bleed. They discard phase data entirely, which creates "blind spots."

---

## Ripping Apart & Reassembling Models (Without Retraining)

### Model Fusion (Combining Weights)
Two scripts exist for **averaging/blending model weights into a single new checkpoint**:

- **ZFTurbo's script** (`model_fusion.py`) 
- **Sucial's script** (similar functionality)

These take 2-3 model checkpoints and output a **weighted blend** as one file. The result is the same size as a single model but approximates an ensemble.

> "I think the models need to have at least the same dim and depth but I'm not sure about that" — mesk

**Example:** Gonzaluigi released Karaoke fusion models blending Gabox + Aufr33/viperx weights at 0.5/0.5. SDR was close to full ensemble but with only one model's inference time.

### Extracting Single Stems from Multi-Stem Weights
From the BS-Roformer SW 6-stem model: **`mask_estimators.0`** corresponds to vocals. Each mask estimator handles one stem. You can extract just the vocals portion to create a smaller, single-purpose model.

### FP16 Weight Conversion
> "I exported it using fp16 just for the smaller size [only 432 MB], the quality is the same." — becruily

When training used `use_amp: True`, saving weights as float16 cuts file size in half with identical inference results.

### Removing Shared Bias (Making Weights Compatible)
The Logic Pro BS-Roformer model had an unusual "shared bias across QKV and out_proj" — Apple's modification. This bias contained only zeros and was removed to make it compatible with standard UVR/MSST code:

> "The only change they made was a global parameter for bias which I've never seen before so I guess it's Apple secret sauce"

### Cleaning Weights for UVR Compatibility
A Python script exists to clean model weights that cause layer errors in UVR:
> "Model trainer didn't clean the weight using this Python script (you can do it by yourself)"

This resolves issues where custom-trained models throw layer mismatch errors.

### Modifying YAML Configs to Change Model Behavior
- Change `target_instrument` from "vocals" to "other" to flip which stem the model prioritizes
- Change `"other"` to `"instrumental"` and `"vocals"` to `"Vocals"` (case-sensitive) for UVR ensemble compatibility
- Delete `linear_transformer_depth: 0` line for compatibility with certain models
- Modify `chunk_size`, `overlap`, `batch_size` at inference time without retraining
- Change `mlp_expansion_factor` from 4→1 to drastically reduce model memory (200MB→23MB for mask estimator) without major quality loss

### Phase Swapping Between Models
You can take the **magnitude spectrogram** from one model's output and the **phase** from another's, combining them in STFT domain. This is done post-inference, not by modifying weights:

```python
# Conceptually:
result_stft = magnitude_from_model_A * exp(j * phase_from_model_B)
```

Becruily wrote standalone Python scripts for this, using librosa. Aufr33 implemented a version on x-minus.

---

## CPU-Specific Information

### What Runs on CPU
- **All MDX-Net v2 models** (HQ_1-5, voc_ft, Kim inst, etc.) — work on even ancient CPUs (Core 2 Quad, AMD A6-9225 confirmed)
- **VR architecture models** — fully CPU-compatible
- **Demucs models** — work on CPU but are very slow
- **Roformer models** — work on CPU (set GPU Conversion off in UVR), extremely slow
- **Ableton 12.3 separation** — CPU-only by design, no GPU option at all
- **SCNet** — "not compatible with DirectML, so AMD GPU users will have to use the CPU for those models... The good news is those models aren't all that slow on CPU." — Anjok
- **Bandit models** — CPU only on AMD/Intel/Mac, no DirectML support
- **Apollo** — no DirectML acceleration, CPU fallback for AMD/Intel
- **Manual Ensemble** in UVR — "very fast, can be used on even old dual-core CPU, as it uses already separated files and simple code"
- **Matchering** — CPU only and fast

### CPU Performance Benchmarks
- **MDX-Net HQ_3** on Ryzen 5 3600: ~2 minutes per song
- **MDX-Net HQ_4** on Core 2 Quad @3.6GHz: ~13 minutes
- **MDX23C/Demucs** on Core 2 Quad: 5-17+ hours (essentially unusable)
- **Roformers** on CPU: similarly impractical for regular use
- **AMD A6-9225 Dual-Core** with 3-model ensemble: ~17 hours
- General rule: "Even Ryzen 5950X is slower than GTX 1050 Ti" for GPU-accelerated separation

### CPU-Friendly Fast Models
Smallest/fastest models that are most practical on CPU:
- **voc_ft** (MDX-Net v2, ~56MB) — "probably the fastest"
- **MDX-Net HQ_4/5** (~56MB)
- **Kim Vocal 1/2** (MDX-Net v2)
- **Aname/Unwa small Mel-Roformers** (~203MB, still slow on weak CPUs)
- **BS-Roformer Resurrection** (195-204MB, but still slow without GPU)
- **splifft FP16 6-stem** (334MB vs 700MB original) — on CPU "might be slower than the OG, as it might not support FP16 natively"

### Minimum CPU Requirements
> "Intel Pentium might be unsupported, but AVX or SSE4.2 instructions are not required, so even newer C2Q like Q9650 with SSE4.1 will suffice."

Official minimum RAM: 8GB, though it works on 6GB. With 4GB RAM you can run out of memory on longer tracks.

### Key CPU Tips
- Disable GPU Conversion in UVR settings to force CPU mode
- On AMD/Intel GPUs that give "Invalid parameter" errors, uncheck GPU Conversion as workaround
- CPU processing avoids some GPU-specific artifacts (some 4GB GPU users get more vocal residues than CPU processing)
- For Demucs on CPU with instrumental input: use `overlap 0.1` and `shifts 10`
- `batch_size=1` is standard for CPU inference# Summary: Demucs Model Weights, Fine-Tuning, and CPU-Relevant Technical Details

## Demucs Models Overview

Demucs (versions 1-4) is a music source separation architecture created by Meta/Facebook. The document references several Demucs model variants:

- **htdemucs_ft** - The best fine-tuned 4-stem model (drums, bass, other, vocals)
- **htdemucs** - Base Hybrid Transformer Demucs v4
- **htdemucs_mmi** - Hybrid Demucs v3 retrained
- **htdemucs_6s** - 6-stem version adding piano and guitar (piano noted as "not working great")
- **mdx_extra** - Best Demucs 3 model from MDX 2021 challenge

### Demucs Weight Files

The htdemucs_ft model consists of **4 separate `.th` weight files**, one per stem:
- `f7e0c4bc-ba3fe64a.th` (drums)
- `d12395a8-e57c48e6.th` (bass)
- `92cfc3b6-ef3bcb9c.th` (other)
- `04573f0d-f3cf25b2.th` (vocals)

These are located in UVR at: `Ultimate Vocal Remover\models\Demucs_Models\v3_v4_repo`

### Demucs File Format Details

- Demucs models use **`.th` extension** (PyTorch state dict format)
- Models trained with ZFTurbo's MSST repo use **`.ckpt` extension** and are **not compatible** with UVR directly (gives `bag_num` error)
- To use Demucs in UVR, you need both the `.th` model files and a corresponding `.yaml` config file
- Demucs weights trained on OG Facebook code work in UVR; those trained via MSST do not

### Demucs Model Weights - Size and Parameters

- The htdemucs_ft model's combined weights are relatively large
- Demucs 4 supports up to **32-bit float output** (use `--float32` flag) or 24-bit integer (`--int24`)
- The `--clip-mode none` argument coupled with `--float32` export prevents volume rescaling

---

## Fine-Tuning and Weight Manipulation

### Model Fusion (Combining Weights)

You can **fuse/merge model weights** from multiple models into a single checkpoint:

- **ZFTurbo's `model_fusion.py` script** or **Sucial's script** (they're similar) allows weighted ensemble of models saved into one checkpoint
- Requirements: "Models need to have at least the same dim and depth"
- The result is a single model file that approximates the quality of running multiple models
- Example: A 50/50 fusion of two karaoke models was tested, producing results similar to (but slightly worse than) running both models separately

### Weight Conversion and Manipulation

**FP16 conversion** - Becruily exported the "deux" model "using fp16 just for the smaller size [only 432 MB], quality is the same." This halves weight file size without quality loss when training used `use_amp: True`.

**Saving weights as float16**: ZFTurbo confirmed "reduces file sizes 2 times, but keeps inference absolutely the same if you used `use_amp: True` for training."

**Extracting single stems from multi-stem weights**: The SW (shared weights) 6-stem model can be trimmed - `mask_estimators.0` is responsible for vocals. Each mask estimator handles one stem. Someone shared a vocals-only extracted version.

**Shared bias removal**: The Logic Pro BS-Roformer model had "a global parameter for bias" (shared across QKV and out_proj) that was actually just zeros. Removing this line from the weight made it compatible with standard UVR/MSST code. "Delete the shared bias line from the yaml" as well.

### Weight Cleaning Script

Before loading models in UVR, trainers should clean weights using a Python script to remove training-only artifacts. If a "model trainer didn't clean the weight using this Python script (you can do it by yourself)" it can cause layer errors in UVR.

### Config/YAML Files

Every Roformer/MDX23C model needs a **YAML config file** paired with its `.ckpt` weight:
- The YAML specifies: `chunk_size`, `dim`, `depth`, `n_fft`, `hop_length`, `num_channels`, `band_configs`, loss settings, overlap, etc.
- Models sharing the same architecture can sometimes share a YAML
- Key parameters in the YAML that affect inference quality:
  - `chunk_size` (in samples, e.g., 352800 = 8 seconds at 44.1kHz)
  - `dim` and `depth` (model size)
  - `num_overlap` (inference overlap)
  - `mlp_expansion_factor` (mask estimator size)

### The chunk_size / dim_t Relationship

The formula: **`chunk_size = (dim_t - 1) * hop_length`**

For Roformers with `hop_length = 441`:
| dim_t | chunk_size | Duration |
| ----- | ---------- | -------- |
| 256   | 112,455    | 2.55s    |
| 801   | 352,800    | 8.00s    |
| 1101  | 485,100    | 11.00s   |

**Best SDR is typically achieved with 11-second chunks** (the training chunk size), though some newer models use different training chunks.

---

## Math/Equations Referenced

### SDR (Signal-to-Distortion Ratio)

```python
def sdr(reference, estimate):
    delta = 1e-7
    num = np.sum(np.square(reference), axis=(1, 2))
    den = np.sum(np.square(reference - estimate), axis=(1, 2))
    num += delta
    den += delta
    return 10 * np.log10(num / den)
```

SDR is **logarithmic** - 1 SDR = 10x difference in distortion ratio.

### Fullness/Bleedless Metrics

Jarredou invented these evaluation metrics using STFT magnitude comparison:
- **Bleedless**: Measures how much unwanted signal (bleed) exists in the separated stem
- **Fullness**: Measures how much of the desired signal is retained
- Both are "stft magnitude-only based and as they are discarding the phase data, they have some kind of blind spots"
- Random noise added to results can artificially increase fullness metric

### Volume Compensation Formula

For MDX-Net v2 models, volume compensation is calculated by comparing true peak of original noise vs processed noise:

```python
difference = 20 * np.log10(true_peak1 / true_peak2)
ratio = 10 ** (difference / 20)
```

### Ensemble Math

- **Max Spec**: Takes highest magnitude value at each frequency bin across all models
- **Min Spec**: Takes lowest magnitude value (reduces bleed but sounds more filtered)
- **Avg Spec**: Averages all models (best SDR generally)
- DAW equivalent of Avg: reduce each stem by **-3 dB per model** (so 3 models = -9 dB each)

### Phase Fixer/Swapper

Operates in **STFT domain**: for each frequency bin, it takes the **magnitude** from one model's output and the **phase** from another model's output, blending with frequency-dependent weights. The `high_frequency_weight` parameter (default 0.8, sometimes set to 2.0) controls blend intensity.

---

## CPU-Specific Information ****needs investigating and updating***

### CPU Performance for Separation

- **CPU separation is very slow** compared to GPU - "even Ryzen 5950X is slower than 1050 Ti"
- MDX-Net HQ_3: ~2 minutes on Ryzen 5 3600, ~20 minutes on Core 2 Quad *we arent using many of these models^
- HQ_4: ~13 minutes on C2Q @3.6GHz
- MDX23C and Demucs: "cannot be processed under ~5-17 hours without GPU acceleration" on C2Q
- Roformers on CPU: Extremely slow. BS-Roformer SW 6-stem took "2 hours" on i3-7100u

### CPU-Compatible Operations

- **Manual Ensemble** in UVR (Audio Tools): "very fast, can be used on even old dual-core CPU, as it uses already separated files and simple code - not model"
- **Matchering**: "use only CPU and are fast"
- Ableton 12.3's stem separation: "doesn't use GPU, and has a slower High Quality setting too... but it can take even 20 minutes for 1 minute file on a slower CPU"

### Minimum CPU Requirements

- Official: Intel Pentium might work; "AVX or SSE4.2 instructions are not required, so even newer C2Q like Q9650 with SSE4.1 will suffice"
- Minimum RAM: 8GB official, works on 6GB, 4GB may run out on longer tracks
- UVR requires minimum **3GB free disk space on C:\** drive

### CPU-Only Workarounds ****find every single work around, trick, alteration, manipulation possible***

- On 4GB VRAM cards, "use CPU processing instead" - may produce fewer vocal residues than constrained GPU processing
- If GPU acceleration isn't available, "you're forced using CPU processing, which is very slow"
- For MSST: "works on CPU or NVIDIA GPUs - by default it uses GPU if it's properly configured"
- Some Demucs models: "Demucs 2 arch on AMD is not supported. All others archs should work" with DirectML

### CPU-Friendly Models (Fastest inference)

Small/fast models for CPU users: *investigate current models, usage and best way to use and run models. 
- **voc_ft** (MDX-Net v2, "probably the fastest" for CPU)
- **Kim Vocal 2** (MDX-Net v2, older but fast)
- **MDX-Net HQ_5** (only 56MB, fastest HQ model)
- **Unwa BS-Roformer Resurrection inst** (only 204MB)
- **BS-Roformer splifft** (FP16 version, 334MB vs 700MB original, "CPU/NVIDIA compatible")
  - Note: "on CPU it might be slower than the OG, as it might not support FP16 natively due to even possible emulation"

### Batch_size on CPU

- Leave at 1 for CPU inference
- "batch_size = 1 without clicks issues (with overlap >= 2 of course)" - the clicking issue with batch_size=1 was fixed in newer MSST code

---

## Weight File Types Summary
****update to current models. leave date and time for verification. 
| Extension | Architecture                     | Notes                                           |
| --------- | -------------------------------- | ----------------------------------------------- |
| `.ckpt`   | Roformers, MDX23C, SCNet, Apollo | PyTorch checkpoint, used by MSST and UVR        |
| `.th`     | Demucs                           | PyTorch state dict, 4 files per model           |
| `.onnx`   | MDX-Net v2                       | ONNX format for older MDX models                |
| `.pth`    | VR arch                          | PyTorch model weights                           |
| `.yaml`   | Config                           | Required alongside `.ckpt` for Roformers/MDX23C |
| `.json`   | Config                           | Used for VR arch model parameters               |

### Key Points About Weights

- **Roformer `.ckpt` files** range from ~200MB (small models) to ~1.9GB (Rifforge, dim 512 depth 24)
- Most Mel-Roformers are ~800-870MB
- The `strict=False` parameter in `load_state_dict` can resolve compatibility issues when loading weights with minor mismatches
- PyTorch 2.6+ requires `torch.serialization.safe_globals([torch._C._nn.gelu])` before `torch.load` for security reasons
- Models can be loaded on CPU with `map_location='cpu'` parameter

----list any other possible ways to achieve higher quality and speed. 