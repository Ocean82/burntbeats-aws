# CPU optimization tips (quality + speed)

**Last updated:** 2026-03-22

**Deployment profile:** This project targets **AWS `t3.large` (or similar) with CPU only — no GPU**. Thread caps (`OMP_NUM_THREADS`, `MKL_NUM_THREADS`, `ONNXRUNTIME_NUM_THREADS`, often **2** on 2 vCPU) match that layout; see root [README.md](../README.md) (*Target environment*) and [`scripts/t3-large-benchmark.sh`](../scripts/t3-large-benchmark.sh).

## What we do by default (needs updating to use .ort models)
## ***find and use test results and score sheet done for each model***
| Tip | Our setting | Notes |
|-----|-------------|--------|
| **Speed = Kim_Vocal_2 (ONNX)** | ✅ | Stage 1 uses ONNX (e.g. Kim_Vocal_2) for **both** Speed and Quality when available. Kim_Vocal_2 is very fast on CPU (seconds vs minutes for Demucs). Only when ONNX is missing do we fall back to Demucs 2-stem for Stage 1. |
| **Shifts = 0** | ✅ Default | `USE_DEMUCS_SHIFTS_0=1` by default. Demucs runs with `--shifts 0`, skipping the “random shift and average” step that helps mainly on GPU. Set `USE_DEMUCS_SHIFTS_0=0` if you want more quality and accept slower runs. |
| **Smaller segment sizes** | ✅ | ONNX: segment 256, overlap 2. Demucs: segment 7 s (under 7.8 s limit). Keeps memory and chunk size CPU-friendly. |
| **Avoid ensemble on CPU** | ✅ Default | Quality bag defaults to **mdx_extra_q** (lighter 4-model bag). Set `DEMUCS_QUALITY_BAG=mdx_extra` only when you want the heavy bag and accept ~3–4× longer runs. |

## 4-stem Demucs (PyTorch, not ONNX)

**Demucs ONNX was removed** from the runtime. For 4-stem and **expand**, the service uses **SCNet ONNX** when configured, then **PyTorch Demucs** via the `demucs` subprocess and **`htdemucs.pth` / `htdemucs.th`** under `models/`. Any `htdemucs_*.onnx` files you keep locally are for experiments or inventory only — they are not loaded by `stem_service` for 4-stem.

## Env summary *needs updating same as above*

| Variable | Default | Effect |
|----------|--------|--------|
| `USE_DEMUCS_SHIFTS_0` | `1` | Demucs uses shifts=0 (faster on CPU). Set `0` to use 3 shifts in Quality. |
| `DEMUCS_QUALITY_BAG` | `mdx_extra_q` | Lighter bag. Set `mdx_extra` for heavy bag (slower, best quality). |
| `USE_VAD_PRETRIM` | `1` | Trim to vocal span first (faster; stems are shorter). |
| `ONNXRUNTIME_NUM_THREADS` | (unset) | ORT thread count; 0 = use physical cores. |
| `OMP_NUM_THREADS` | `nproc` | Set by run script; tune if needed. |
