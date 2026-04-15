# Model inventory & ORT benchmark runbook

Facts over guesses: every ONNX under `models/` is classified, optionally converted to ORT, and timed on a fixed clip so you know what runs in `stem_service` and how fast.

## Environment (Windows vs WSL/Linux)

Use a **venv created on the same OS** you run Python on:

- **WSL Ubuntu:** `cd /mnt/d/burntbeats-aws && source .venv/bin/activate` — there is no `venv\Scripts` on Linux; that is normal.
- **Windows PowerShell:** 'this will not work when trying to activate .venv. It must be in wsl with ubuntu. 

Mixing a Windows venv with WSL Python (or the reverse) causes real breakage. The ONNX Runtime lines below are **not** that.

### ONNX Runtime “MergeShapeInfo” / `scaled_dot_product_flash_attention` messages

When loading some ONNX files (often transformer-style graphs), ONNX Runtime may print **warnings** about merging shape info and “Falling back to lenient merge.” Verify those are **not failures** for the inventory script: if the model loads, the row is recorded. The scan script sets `ORT_LOGGING_LEVEL=3` (errors only) by default to hide this noise; set `ORT_LOGGING_LEVEL=2` if you want warnings visible.

## 1. Scan (inventory)

```bash
python scripts/scan_models_inventory.py 
```
Always verify that this still hold true:
Produces:

| Output | Purpose |
|--------|---------|
| `tmp/model_inventory.csv` | Machine-readable: path, classification, shapes, ORT present |
| `docs/MODEL-INVENTORY-AUTO.md` | Human-readable table (regenerate; do not hand-edit) |

Vendor trees (e.g. `models/demucs.onnx-main/`) are excluded by default.

**Classifications** (see script for rules):

	Always double check everything. Ensure that proper models are in use. Always verify that models being used are using the correct runtime for that particular model in order to operate as intended. 

## 2. Batch ORT conversion (build / prep)

```bash
python scripts/convert_all_onnx_to_ort.py --dry-run   # preview
python scripts/convert_all_onnx_to_ort.py             # convert; log in tmp/convert_onnx_to_ort_log.txt
```

Skips when a sibling `.ort` already exists (use `--force` to rebuild).

## 3. Full ONNX vs ORT matrix (timing)

Requires `tmp/model_inventory.csv` from step 1.

```bash
python scripts/benchmark_model_matrix.py --wav "path/to/clip.wav"
# or use benchmark_song.local.txt / BENCHMARK_SONG
```

Writes `tmp/model_matrix_benchmark/summary.json` and `summary.csv` with per-model **ONNX** and **ORT** wall times (30s clip by default, `--clip-seconds`).

**Includes:** all qualified `mdx_dim3072` / `mdx_dim2560` models with config, all `demucs_embedded_segment` models, and one **MDX23C** pair row if both ONNX exist.

**Does not** auto-bench SCNet alternate paths (service uses fixed `SCNET_ONNX`).

## 4. Tier defaults used by API

The API now maps quality lanes to model tiers for Stage 1 ONNX selection:

- `quality=speed` -> tier `fast`
- `quality=balanced` (default) -> tier `balanced`
- `quality=quality` -> tier `quality`


Current tier candidate order lives in `stem_service/mdx_onnx.py` (`_VOCAL_TIER_NAMES`, `_INST_TIER_NAMES`).
this should be updated with latest changes as of 4/14. if this statement is still present, this has not been updated. 
| Tier | Vocal priority (first found wins) | Instrumental priority (first found wins) |
|------|-----------------------------------|-------------------------------------------|
| `fast` | `UVR_MDXNET_3_9662` -> `UVR_MDXNET_KARA` -> `UVR_MDXNET_2_9682` -> `UVR_MDXNET_1_9703` -> `kuielab_b_vocals` | `UVR-MDX-NET-Inst_HQ_5` -> `UVR-MDX-NET-Inst_HQ_4` -> `UVR_MDXNET_KARA_2` -> `Kim_Inst` |
| `balanced` | `Kim_Vocal_1` -> `Kim_Vocal_2` -> `UVR-MDX-NET-Voc_FT` -> `kuielab_b_vocals` -> `kuielab_a_vocals` | `UVR-MDX-NET-Inst_HQ_5` -> `UVR-MDX-NET-Inst_HQ_4` -> `UVR_MDXNET_KARA_2` |
| `quality` |`Kim_Vocal_2` -> `Kim_Vocal_1`| `UVR-MDX-NET-Inst_HQ_4` -> `UVR-MDX-NET-Inst_HQ_5` -> `UVR_MDXNET_KARA_2` -> `Kim_Inst` |

Notes: as of 4/14 if this statement is present then this has not been updated with the current structure. 
- need to ensure that models are being correctly used. ONNX and ORT operate differently than regular models when using demucs models. 	investigate proper run format for most effecient runs. SFT
- For 2-stem preview/routing, `quality` tier may prefer  =
- ORT siblings are preferred over ONNX at runtime when both exist (unless explicitly forced for benchmarking).
-STFT Rewrite: The STFT and ISTFT operations must be included within the model's forward call to be ONNX-compatible (using 1D convolutions).
-To make STFT and ISTFT operations ONNX-compatible within a PyTorch model's forward call, they must be implemented using 1D convolutions (or similar native operations) rather than relying on torch.stft or torch.istft directly, which may not export well across all ONNX opsets.Here is the implementation approach using Conv1d and ConvTranspose1d for ONNX compatibility.1. Conv-Based STFT (Forward Call)STFT can be implemented as a convolution with a fixed, precomputed Fourier basis (windowed sine/cosine filters).

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

class STFT(nn.Module):
    def __init__(self, n_fft, hop_length, win_length, window='hann'):
        super(STFT, self).__init__()
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.win_length = win_length
        
        # Create window
        if window == 'hann':
            window_tensor = torch.hann_window(win_length)
        else:
            window_tensor = torch.ones(win_length)
            
        # Create FFT filters (precompute sin/cos)
        # Using 1D convolution to act as STFT
        # Shape: (n_fft // 2 + 1) * 2, 1, win_length
        self.register_buffer('filter_real', self._create_filter(window_tensor, real=True))
        self.register_buffer('filter_imag', self._create_filter(window_tensor, real=False))

    def _create_filter(self, window_tensor, real=True):
        # Implementation of creating Sin/Cos filters
        # Referencing: https://github.com/pseeth/torch-stft
        basis = torch.zeros(self.n_fft // 2 + 1, self.n_fft)
        for i in range(self.n_fft // 2 + 1):
            if real:
                basis[i, :] = np.cos(2 * np.pi * i * np.arange(self.n_fft) / self.n_fft)
            else:
                basis[i, :] = np.sin(2 * np.pi * i * np.arange(self.n_fft) / self.n_fft)
        
        filter = basis * window_tensor
        return filter.unsqueeze(1) # For Conv1d

    def forward(self, x):
        # x shape: (batch, time) -> needs (batch, 1, time)
        if x.dim() == 2:
            x = x.unsqueeze(1)
        
        # Perform convolution to get real and imag parts
        real = F.conv1d(x, self.filter_real, stride=self.hop_length, padding=self.n_fft//2)
        imag = F.conv1d(x, self.filter_imag, stride=self.hop_length, padding=self.n_fft//2)
        
        # Stack to create complex output: (batch, freq, time, 2)
        return torch.stack([real, imag], dim=-1)


-class ISTFT(nn.Module):
    def __init__(self, n_fft, hop_length, win_length, window='hann'):
        super(ISTFT, self).__init__()
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.win_length = win_length
        
        # Similar filter creation to STFT, but used for transposed conv
        # ... [Precompute inverse filters] ...
        # self.register_buffer('filter_inv', ...)

    def forward(self, x):
        # x shape: (batch, freq, time, 2)
        real = x[..., 0]
        imag = x[..., 1]
        
        # Transposed convolution to reconstruct
        # recon = F.conv_transpose1d(real, ...) - F.conv_transpose1d(imag, ...)
        # ... [Windowing and overlap-add] ...
        return recon
-Key Considerations for ONNXONNX Opset: ONNX added native STFT in opset 17, but ISTFT support is still limited. Using Conv1d/ConvTranspose1d ensures compatibility with older opsets (9-16).Weights: The convolutional weights (filters) for STFT/ISTFT must be fixed and registered as buffers (not trainable parameters) to ensure they are exported as constants in the ONNX graph.Memory/Speed: Conv-based STFT/ISTFT can be slower than torch.stft. Using Conv1d on large inputs might require careful management of padding and windowing.Precomputed Basis: The filters must be precomputed as a Hann/Hamming windowed sinusoidal matrix.

-To run a .th model (a legacy PyTorch weight format) using ONNX Runtime, you must first convert the model to the ONNX format (.onnx), as ONNX Runtime cannot directly execute .th files. [1, 2, 3] 
## 1. Load and Export the Model in Python [4] 
Since .th files are essentially pickled PyTorch models or state dicts, you use PyTorch to load the weights and then export the model structure to ONNX. [3, 5, 6, 7] 

import torchimport torch.onnx
# 1. Initialize your model class (ensure architecture matches the .th file)model = YourModelClass()
# 2. Load weights from the .th file
model.load_state_dict(torch.load("model_weights.th"))
model.eval()
# 3. Create dummy input (must match model's expected input shape)dummy_input = torch.randn(1, 3, 224, 224) 
# 4. Export to .onnx format
torch.onnx.export(model, dummy_input, "model.onnx", opset_version=14)

## 2. Run with ONNX Runtime
Once you have the .onnx file, you can load and run it using the onnxruntime library. [8, 9] 

import onnxruntime as ortimport numpy as np
# Load the ONNX modelsession = ort.InferenceSession("model.onnx")
# Prepare input data as a NumPy arrayinput_name = session.get_inputs()[0].nameinput_data = np.random.randn(1, 3, 224, 224).astype(np.float32)
# Run inferenceoutputs = session.run(None, {input_name: input_data})
print(outputs)

## Key Considerations

* Weights vs. Full Models: If your .th file contains only the state_dict (weights), you must instantiate the model class in Python before loading it. If it contains the full model, use torch.load().
* Opset Version: When exporting, choose a recent [ONNX opset version](https://onnxruntime.ai/docs/reference/compatibility.html) (e.g., 14 or 17) to ensure all PyTorch operators are supported.
* Performance: Running models through ONNX Runtime can often provide 4-5x faster inference than native PyTorch due to graph optimizations.
* Hardware Acceleration: You can leverage GPUs by installing onnxruntime-gpu and specifying [Execution Providers](https://onnxruntime.ai/docs/execution-providers/) like CUDA or TensorRT. [2, 6, 10, 11, 12, 13, 14] 

Would you like help debugging a specific error during the export process or setting up GPU acceleration?

[1] [https://onnxruntime.ai](https://onnxruntime.ai/docs/)
[2] [https://www.reddit.com](https://www.reddit.com/r/csharp/comments/1ospcvg/does_anyone_know_how_to_get_started_with_onnx/)
[3] [https://onnxruntime.ai](https://onnxruntime.ai/docs/api/python/tutorial.html#:~:text=*%20Step%201:%20Train%20a%20model%20using,and%20run%20the%20model%20using%20ONNX%20Runtime.)
[4] [https://forums.unrealengine.com](https://forums.unrealengine.com/t/course-neural-network-engine-nne/1162628?page=7#:~:text=You%20will%20need%20to%20checkout%20the%20repo,with%20the%20regular%20torch.%20onnx%20export%20functions.)
[5] [https://onnxruntime.ai](https://onnxruntime.ai/blogs/pytorch-on-the-edge)
[6] [https://medium.com](https://medium.com/@vigneshkumar25/onnx-explained-simply-how-to-run-ai-models-anywhere-83706fd9866e)
[7] [https://www.centron.de](https://www.centron.de/en/tutorial/pytorch-vs-tensorflow-vs-onnx-ml-deployment-guide/#:~:text=After%20training%2C%20the%20model%27s%20parameters%20are%20stored.,runtimes%20%28as%20discussed%20later%20in%20this%20guide%29.)
[8] https://onnxruntime.ai
[9] [https://onnxruntime.ai](https://onnxruntime.ai/docs/api/python/auto_examples/plot_load_and_predict.html)
[10] [https://www.youtube.com](https://www.youtube.com/watch?v=jrIJT01E8Xw&t=17)
[11] [https://medium.com](https://medium.com/@ardiantovn/run-the-deep-learning-model-4-5x-faster-with-onnx-runtime-760db96cabdb)
[12] [https://medium.com](https://medium.com/@manevaish17/make-your-models-fly-onnx-runtime-latency-gains-for-pytorch-with-9e26d645889e#:~:text=Hence%2C%20ONNX%20Runtime%20model%20is%20significantly%20faster,when%20using%20GPU%20execution%20providers%20like%20TensorRT.)
[13] [https://onnxruntime.ai](https://onnxruntime.ai/docs/execution-providers/)
[14] [https://onnxruntime.ai](https://onnxruntime.ai/docs/install/)

## 5. Adding an “untapped” ONNX

1. Drop the file under `models/` (not inside excluded vendor dirs).
2. Re-run **scan**. If classification is MDX-like but **benchmark skips**, add a line to `_MDX_CONFIGS` in `stem_service/mdx_onnx.py` (copy from Kim/Inst_HQ if shapes match).
3. Re-run **convert** (optional) and **benchmark_matrix**.

## 6. Related docs

- [ORT-MODEL-CONVERSION.md](ORT-MODEL-CONVERSION.md) — ORT vs ONNX at runtime  
- [MODELS-INVENTORY.md](MODELS-INVENTORY.md) — historical deep audit (manual)  
- [MODEL-INVENTORY-AUTO.md](MODEL-INVENTORY-AUTO.md) — **generated** index (current tree)  
