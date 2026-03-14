# 8-bit quantization for CPU inference (AVX/SSE)

**Last updated:** 2026-03-12

## Goal

Quantize 32-bit floating-point model parameters and activations to 8-bit integers so that:

- More operations fit in AVX/SSE vector registers (e.g. 32× int8 vs 8× float32 per AVX-256 lane).
- Memory bandwidth and cache pressure drop (4× smaller weights and often smaller activations).
- On CPUs with VNNI (AVX2-VNNI, AVX-512-VNNI), int8 dot-product instructions can give large speedups.

## Where we use 32-bit floats today

| Component | What's float32 | Quantization path |
|-----------|----------------|--------------------|
| **MDX ONNX** (Stage 1 vocal/instrumental) | Model weights and activations; audio I/O | ONNX Runtime dynamic/static int8 → prefer `.quant.onnx` when present |
| **Demucs** (htdemucs, Stage 2) | PyTorch model and tensors; invoked via CLI subprocess | No change in this repo; would require Demucs-as-library + PyTorch FX int8 or a quantized Demucs build |
| **Silero VAD** | torch.jit model | Optional: PyTorch JIT quantization; smaller win (VAD is cheap) |

## ONNX (MDX) – implemented

- **Script:** `scripts/quantize_onnx_models.py` – builds int8 versions of MDX ONNX models using ONNX Runtime’s `quantize_dynamic()` (weights → int8; activations quantized on-the-fly, no calibration).
- **Naming:** For each `model.onnx`, the script writes `model.quant.onnx` in the same directory.
- **Loader:** `stem_service/mdx_onnx.py` prefers a `.quant.onnx` file when it exists next to the `.onnx`; otherwise uses the original float32 model. Set `USE_INT8_ONNX=0` to force float32.
- **Format:** S8S8 (signed activations, signed weights) by default for CPU; ONNX Runtime can use AVX2/AVX-VNNI for int8 GEMM.

**How to generate quantized MDX models (from repo root):**

```bash
source .venv/bin/activate
pip install onnxruntime  # if not already
python scripts/quantize_onnx_models.py
```

Then run the stem pipeline as usual; the service will load `.quant.onnx` when present.

## Demucs – not quantized in this repo

- Demucs is run as a **subprocess** (`python -m demucs ...`). We do not load its weights in our process.
- To run Demucs in int8 we would need to either:
  - Call Demucs as a **library** (load the model in Python, apply PyTorch FX int8, run our own separation loop), or
  - Depend on a distribution that ships pre-quantized Demucs (e.g. `demucs-infer` with quantized extra) and invoke that.
- PyTorch’s x86 int8 backend (FBGEMM/oneDNN) can give ~2–3× speedup for compatible models; implementing this would be a larger refactor (replace subprocess with in-process inference).

## VAD (Silero)

- Silero VAD is small and fast; quantizing it gives limited benefit. Optional later step (e.g. `torch.quantization.quantize_jit`).

## Env / behaviour

| Variable | Effect |
|----------|--------|
| (none) | Use `.quant.onnx` when present next to `.onnx`. |
| `USE_INT8_ONNX=0` | Skip int8; load only float32 `.onnx` (useful if int8 quality is worse on some models). |

## References

- [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/quantization.html) – dynamic vs static, S8S8/U8U8, QDQ vs QOperator.
- [ORT AVX-VNNI int8](https://github.com/microsoft/onnxruntime/pull/21123) – S8S8/S8U8 and VNNI.
- [PyTorch int8 x86](https://pytorch.org/blog/int8-quantization/) – FX graph mode, x86 backend.
