# CPU-Only Demucs Fine-Tuning & 4-Stem Separation: Complete Summary

## 1. BEST DEMUCS MODEL FOR 4-STEM CPU SEPARATION

**Use `htdemucs_ft`** — the fine-tuned Hybrid Transformer Demucs v4. It's the best single 4-stem model (drums, bass, other, vocals).

**Multisong dataset SDR:** bass: 12.24, drums: 11.41, other: 5.84, vocals: 8.43

---

## 2. OPTIMAL CPU INFERENCE PARAMETERS

### Speed/Quality Balance for CPU
```
Model: htdemucs_ft
Shifts: 0-2        # (each shift = ~1.7x slower; 0 is fastest)
Overlap: 0.25      # default, good balance
Segment: default (256 in UVR)
```

### Best Quality (slow on CPU)
```
Shifts: 10         # significant quality gain, 10x slower
Overlap: 0.75      # max reasonable before extreme slowdown
                   # 0.95-0.99 is overkill on CPU
```

### For Instrumental-Only Input (already separated)
```
Shifts: 10
Overlap: 0.1       # best for instrumentals as input
```

### Key Formulas
- **Overlap** controls crossfading between audio chunks. Higher = better quality, much slower
- **Shifts** pads audio with random silence (0–0.5s), processes multiple times, averages results
- Processing time ≈ `base_time × shifts × (1/(1-overlap))`

---

## 3. CPU SEPARATION CODE (Python CLI)

### Install Demucs
```bash
pip install demucs
# or from repo:
pip install git+https://github.com/facebookresearch/demucs#egg=demucs
```

### Basic CPU Separation
```bash
python -m demucs -n htdemucs_ft --device cpu "input.wav"
```

### Optimized CPU Separation
```bash
python -m demucs \
  -n htdemucs_ft \
  --device cpu \
  --shifts 2 \
  --overlap 0.25 \
  --clip-mode clamp \
  --float32 \
  "input.wav" \
  -o "./output/"
```

### Maximum Quality (very slow on CPU)
```bash
python -m demucs \
  -n htdemucs_ft \
  --device cpu \
  --shifts 10 \
  --overlap 0.75 \
  --clip-mode clamp \
  --float32 \
  "input.wav" \
  -o "./output/"
```

### Parameters Explained
| Parameter | Effect | CPU Impact |
|-----------|--------|------------|
| `--shifts N` | Random time-shift augmentation, averages N passes | Linear slowdown (Nx) |
| `--overlap 0.XX` | Chunk overlap ratio | Exponential slowdown above 0.75 |
| `--clip-mode clamp` | Hard limiter on output | Negligible |
| `--float32` | 32-bit float output (no clipping loss) | Negligible |
| `--int24` | 24-bit integer output | Negligible |
| `--segment N` | Segment size in seconds | Lower = less RAM |

---

## 4. FINE-TUNING DEMUCS ON CPU

### Repository
```bash
git clone https://github.com/ZFTurbo/Music-Source-Separation-Training
cd Music-Source-Separation-Training
pip install -r requirements.txt
```

### Dataset Structure (Type 1 - Aligned)
```
dataset/
├── train/
│   ├── song_001/
│   │   ├── vocals.wav
│   │   ├── drums.wav
│   │   ├── bass.wav
│   │   └── other.wav
│   ├── song_002/
│   │   └── ...
├── validation/
│   ├── song_001/
│   │   ├── vocals.wav
│   │   ├── drums.wav
│   │   ├── bass.wav
│   │   ├── other.wav
│   │   └── mixture.wav    # required for validation
│   └── ...
```

**Minimum dataset:** 200+ pairs (500+ recommended for fine-tuning)

### Training Command (CPU - extremely slow but works)
```bash
python train.py \
  --model_type htdemucs \
  --config_path configs/config_musdb18_htdemucs.yaml \
  --results_path results/ \
  --data_path ./dataset/train \
  --valid_path ./dataset/validation \
  --num_workers 2 \
  --device_ids cpu \
  --dataset_type 1
```

### Resume from Checkpoint
```bash
python train.py \
  --model_type htdemucs \
  --config_path configs/config_musdb18_htdemucs.yaml \
  --start_check_point "results/last_htdemucs.ckpt" \
  --results_path results/ \
  --data_path ./dataset/train \
  --valid_path ./dataset/validation \
  --num_workers 2 \
  --device_ids cpu
```

### Critical Config Parameters (YAML)
```yaml
audio:
  chunk_size: 485100    # ~11s at 44100Hz
  sample_rate: 44100
  channels: 2

training:
  batch_size: 1          # CPU: keep at 1
  gradient_accumulation_steps: 4  # simulate larger batch
  lr: 5.0e-05            # fine-tuning LR
  patience: 1000         # disable LR reduction
  num_epochs: 300
  optimizer: adam
  weight_decay: 0
  use_amp: false          # no mixed precision on CPU

augmentations:
  enable: true
  remix:
    proba: 1
    group_size: 4
```

### Key Training Notes
- **CPU training is orders of magnitude slower** — a single epoch that takes minutes on GPU takes hours on CPU
- **`use_amp: false`** is required for CPU (no mixed precision without GPU)
- **batch_size: 1** is the only realistic option on CPU
- **gradient_accumulation_steps** can simulate larger batches without extra memory
- **Patience set high** (1000) to prevent premature learning rate reduction
- The document notes Demucs HT training is "very slow" with possible bugs even on GPU
- **Minimum 200 epochs** recommended from scratch; fine-tuning may need 30-100

### Loss Function
Demucs uses L1 loss combined with multi-resolution STFT loss by default. The training script handles this automatically.

---

## 5. FAST CPU INFERENCE: PYTHON-AUDIO-SEPARATOR

```bash
pip install audio-separator
```

```python
from audio_separator.separator import Separator

separator = Separator(
    model_file_dir="/path/to/models/",
    output_dir="./output/",
    output_format="WAV",
    sample_rate=44100
)

# For Demucs
separator.load_model(model_filename="htdemucs_ft")
output_files = separator.separate("input.wav")
```

---

## 6. BONUS: ORT (ONNX Runtime) MODELS FOR 2-STEM CPU SEPARATION

### Why ONNX/ORT on CPU
- MDX-Net v2 models (HQ_3, HQ_4, HQ_5, voc_ft, Kim inst) are ONNX format
- ONNX Runtime is optimized for CPU inference
- Significantly faster than Demucs on CPU for 2-stem separation

### Install
```bash
pip install onnxruntime    # CPU-only version
# NOT onnxruntime-gpu
```

### Best 2-Stem Models for CPU (ONNX format)
| Model | Use | Size | Notes |
|-------|-----|------|-------|
| `UVR-MDX-NET-Inst_HQ_4` | Instrumental | ~56MB | Best speed/quality |
| `UVR-MDX-NET-Voc_FT` | Vocals | ~63MB | Narrowband (17.7kHz) |
| `MDX23C-InstVoc_HQ` | Both | Larger | Fullband, slower |

### MDX-Net ONNX Inference Parameters
```python
# Key parameters for MDX-Net v2 ONNX models
segment_size = 512       # sweet spot for quality
overlap = 0.5            # good CPU balance (0.75-0.8 for quality)
batch_size = 1           # CPU: always 1
denoise = True           # removes MDX architecture noise
```

### Using python-audio-separator for ONNX
```python
from audio_separator.separator import Separator

sep = Separator(
    model_file_dir="./models/",
    output_dir="./output/",
)

# Load MDX model (ONNX)
sep.load_model(model_filename="UVR-MDX-NET-Inst_HQ_4.onnx")
results = sep.separate("song.wav")
```

### Converting Roformer to ONNX (experimental)
The document references a repo for converting Mel-Roformers, HTDemucs, and Apollo models to OpenVINO/ONNX:
```
# Using OpenVINO conversion repo referenced in the doc
# This can enable CPU-optimized inference for Roformer models
```

---

## 7. CHUNK PROCESSING ALGORITHM

The core algorithm for processing long files on CPU:

```python
import numpy as np

def process_chunks(audio, model, chunk_size, overlap_ratio, shifts=0):
    """
    chunk_size: samples per chunk (e.g., 485100 for ~11s at 44100Hz)
    overlap_ratio: 0.0-0.99 (0.25 default)
    shifts: number of random time-shift augmentations
    """
    length = audio.shape[-1]
    hop = int(chunk_size * (1 - overlap_ratio))
    
    # Fade/crossfade windows
    fade_len = int(chunk_size * overlap_ratio / 2)
    fade_in = np.linspace(0, 1, fade_len)
    fade_out = np.linspace(1, 0, fade_len)
    
    results = np.zeros_like(audio)  # accumulator
    weight = np.zeros(length)        # normalization weights
    
    for shift in range(max(1, shifts)):
        # Random pad for shift trick
        if shifts > 0:
            pad = int(np.random.uniform(0, 0.5 * 44100))
            padded = np.pad(audio, ((0,0), (pad, 0)))
        else:
            padded = audio
            pad = 0
            
        for start in range(0, padded.shape[-1], hop):
            end = min(start + chunk_size, padded.shape[-1])
            chunk = padded[:, start:end]
            
            # Pad last chunk if needed
            if chunk.shape[-1] < chunk_size:
                chunk = np.pad(chunk, 
                    ((0,0), (0, chunk_size - chunk.shape[-1])))
            
            # MODEL INFERENCE
            separated = model(chunk)  # returns dict of stems
            
            # Apply crossfade and accumulate
            # (simplified - real impl uses proper windowing)
            actual_len = min(end, padded.shape[-1]) - start
            for stem_name, stem_data in separated.items():
                results[stem_name][:, start:start+actual_len] += \
                    stem_data[:, :actual_len]
            weight[start:start+actual_len] += 1.0
        
        # Remove shift padding
        if pad > 0:
            results = results[:, pad:]
            weight = weight[pad:]
    
    # Average overlapping regions
    results /= np.maximum(weight, 1e-8)
    return results
```

---

## 8. CPU PERFORMANCE EXPECTATIONS

From the document's benchmarks:

| Task | CPU | Time |
|------|-----|------|
| MDX-Net HQ_4 (1 song) | Core 2 Quad @3.6 | ~13 min |
| MDX-Net HQ_3 (1 song) | Ryzen 5 3600 | ~2 min |
| Demucs_ft 4-stem | Core 2 Quad | 5-17 hours |
| MDX23C model | Core 2 Quad | 5-17 hours |
| BS/Mel-Roformer | Core 2 Quad | 5-17 hours |

**For fastest CPU 4-stem separation:** Use Demucs with `shifts=0, overlap=0.25` (default), or use MDX23C `kuielab_b` model which is "lightning-fast but quality is mediocre."

**For best quality on CPU:** Accept the time cost and use `htdemucs_ft` with `shifts=2, overlap=0.5`.

---

## 9. KEY ALGORITHMIC INSIGHT: WHY SHIFTS WORK

From the document quoting jarredou:

> "Shifts is performing lower than overlap because it is limited to that 0.5 seconds max value of shifting, when overlap is shifting progressively across the whole song. Both work because they are shifting the starting point of the separations."

The math: changing the starting point of STFT analysis yields slightly different separation results. Averaging multiple shifted passes reduces artifacts at chunk boundaries and improves consistency — essentially a form of test-time augmentation (TTA).

---

## 10. PRACTICAL RECOMMENDATION

For **fastest perfect-sounding 4-stem CPU separation**:

1. **Pre-process**: Use a fast 2-stem MDX-Net ONNX model (HQ_4) to get clean instrumental first
2. **Then**: Feed that instrumental into `htdemucs_ft` with `shifts=2, overlap=0.5` for 4-stem split
3. **Post-process**: Use manual ensemble (max spec) if you ran multiple configurations

This two-stage approach gives better drums/bass/other stems because the Demucs model doesn't have to fight vocal bleed, significantly improving quality with less computation.