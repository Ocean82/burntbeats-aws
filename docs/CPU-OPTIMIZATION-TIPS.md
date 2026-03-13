# CPU optimization tips (quality + speed)

**Last updated:** 2026-03-13

## What we do by default

| Tip | Our setting | Notes |
|-----|-------------|--------|
| **Speed = Kim_Vocal_2 (ONNX)** | ✅ | Stage 1 uses ONNX (e.g. Kim_Vocal_2) for **both** Speed and Quality when available. Kim_Vocal_2 is very fast on CPU (seconds vs minutes for Demucs). Only when ONNX is missing do we fall back to Demucs 2-stem for Stage 1. |
| **Shifts = 0** | ✅ Default | `USE_DEMUCS_SHIFTS_0=1` by default. Demucs runs with `--shifts 0`, skipping the “random shift and average” step that helps mainly on GPU. Set `USE_DEMUCS_SHIFTS_0=0` if you want more quality and accept slower runs. |
| **Smaller segment sizes** | ✅ | ONNX: segment 256, overlap 2. Demucs: segment 7 s (under 7.8 s limit). Keeps memory and chunk size CPU-friendly. |
| **Avoid ensemble on CPU** | ✅ Default | Quality bag defaults to **mdx_extra_q** (lighter 4-model bag). Set `DEMUCS_QUALITY_BAG=mdx_extra` only when you want the heavy bag and accept ~3–4× longer runs. |

## htdemucs_6s.onnx and htdemucs_embedded.onnx

These are **Demucs-style ONNX** exports (not MDX). They live under `models/` (e.g. `htdemucs_6s.onnx`, `htdemucs_embedded.onnx`).

- **6s:** Often tuned for 6-second (or similar) chunks; can be faster than full-length Demucs.
- **embedded:** Often a smaller/faster variant for web or edge.

They use a **different graph and I/O** than our MDX ONNX path (which expects `model_data.json` and MDX config). To use them we need a **separate inference path**: load the ONNX, run with the expected input shape (e.g. stereo, fixed sample rate), and parse the 4-stem (or 2-stem) outputs. That’s not wired yet.

**Next steps to try them:** Add a small module (e.g. `stem_service/demucs_onnx.py`) that:

1. Discovers `htdemucs_6s.onnx` / `htdemucs_embedded.onnx` under `models/`.
2. Runs ONNX inference with the correct input layout (check the model’s expected shape on Hugging Face or the export repo).
3. Writes vocals, drums, bass, other (and optionally instrumental) to WAV.

Then either call that for “Speed” 4-stem instead of the Demucs subprocess, or add a “Demucs ONNX” mode that prefers 6s/embedded when available.

## Env summary

| Variable | Default | Effect |
|----------|--------|--------|
| `USE_DEMUCS_SHIFTS_0` | `1` | Demucs uses shifts=0 (faster on CPU). Set `0` to use 3 shifts in Quality. |
| `DEMUCS_QUALITY_BAG` | `mdx_extra_q` | Lighter bag. Set `mdx_extra` for heavy bag (slower, best quality). |
| `USE_VAD_PRETRIM` | `1` | Trim to vocal span first (faster; stems are shorter). |
| `ONNXRUNTIME_NUM_THREADS` | (unset) | ORT thread count; 0 = use physical cores. |
| `OMP_NUM_THREADS` | `nproc` | Set by run script; tune if needed. |
