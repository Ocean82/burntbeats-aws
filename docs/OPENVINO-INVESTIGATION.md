# OpenVINO integration investigation

**Date:** 2026-03-16  

**Status (2026-04):** The **Demucs ONNX** row below is **historical** — that code path was removed; 4-stem uses PyTorch Demucs. MDX / SCNet ONNX notes remain relevant for OpenVINO exploration.

**Goal:** Determine whether the burntbeats-aws stem separation project would benefit from incorporating and implementing Intel OpenVINO.

---

## 1. Project inference stack (current)

### 1.1 Where inference runs

| Component | Location | Runtime | Role |
|-----------|----------|--------|------|
| **MDX vocal/inst/dereverb** | `stem_service/mdx_onnx.py` | **onnxruntime** | Stage 1: 2-stem (vocals + instrumental); optional dereverb. Chunked spectrogram → `session.run()`; STFT/iSTFT via PyTorch. |
| **Demucs 4-stem** | `stem_service/split.py` (`run_demucs`) | **PyTorch** (subprocess) | 4-stem via `demucs` CLI + `htdemucs.pth`/`.th` — not ONNX in current stack. |
| **Silero VAD** | `stem_service/silero_onnx_vad.py` | **onnxruntime** | Pre-trim to vocal span (optional). ONNX-only. |
| **Ultra (RoFormer)** | `stem_service/ultra.py` | **PyTorch** (music_source_separation) | Best quality 2-stem; CPU allowed but very slow; effectively GPU-only. |
| **Phase inversion** | `stem_service/phase_inversion.py` | **PyTorch** (torch/torchaudio) | No model; arithmetic (original − vocals). |

### 1.2 Deployment and tuning

- **Default:** CPU-first. `requirements.txt` uses `onnxruntime` (not `onnxruntime-gpu`); optional CUDA via `get_onnx_providers()` when available.
- **Env:** `ONNXRUNTIME_NUM_THREADS`, `OMP_NUM_THREADS`, `USE_ONNX_CPU`, `USE_DEMUCS_SHIFTS_0`, `USE_VAD_PRETRIM` (see `docs/CPU-OPTIMIZATION-TIPS.md`).
- **Optional:** INT8 quantized models (`.quant.onnx`) when `USE_INT8_ONNX=1` and file exists.
- **Deployment:** Script-based (WSL, EC2 Ubuntu); no Docker in repo. One job per request; no batched inference.

### 1.3 Bottlenecks (from project docs)

- **2-stem:** Already ONNX-first (MDX); Demucs 2-stem subprocess only when ONNX missing.
- **4-stem:** SCNet ONNX first when enabled; else hybrid pipeline with PyTorch Demucs subprocess.
- **CPU:** Chunk sizes, overlap, shifts=0, and thread limits are tuned for CPU; further gains are from faster ONNX execution or quantization.

---

## 2. What OpenVINO provides

- **OpenVINO** = Intel toolkit for optimized inference on CPU, integrated GPU, and NPU.
- **ONNX support:** OpenVINO can run ONNX models via:
  - **Option A:** Convert ONNX → IR (Intermediate Representation) and run with OpenVINO Core, or
  - **Option B:** Use **OpenVINO Execution Provider for ONNX Runtime** — keep `InferenceSession` and swap the backend to OpenVINO (CPU/GPU) instead of ORT’s default CPU EP.
- **Typical benefit on Intel CPUs:** In published benchmarks, OpenVINO EP has shown ~3–4× speedup over ONNX Runtime’s default CPU EP for some CNN-style workloads; results depend on model shape, ops, and threading. Audio models (MDX, Demucs) are not always in those benchmarks; real gains need to be measured.
- **Constraints:** OpenVINO EP uses multiple threads by default; comparison with ORT CPU EP should control for thread count. Compatibility is versioned (e.g. ORT 1.24.x with OpenVINO 2025.4.x).

---

## 3. Would the project benefit?

### 3.1 Where OpenVINO could help

| Area | Benefit | Effort |
|------|----------|--------|
| **MDX ONNX (vocal, inst, dereverb)** | Same ONNX files; swap to OpenVINO EP. Potential CPU speedup (to be benchmarked). | Low: add OpenVINO EP to provider list in `config.get_onnx_providers()` and optionally in `mdx_onnx._onnx_session()`. |
| **SCNet ONNX (4-stem)** | Same EP idea as MDX; ONNX in `scnet_onnx.py`. | Low. |
| **Silero VAD** | Small model; possible latency reduction. | Low. |
| **Intel CPU EC2 / on-prem** | If deployment is on Intel, OpenVINO is a natural fit. | N/A. |

### 3.2 Where OpenVINO does not apply (or is marginal)

| Area | Reason |
|------|--------|
| **Ultra (RoFormer)** | PyTorch + external lib; not ONNX. Converting or replacing with OpenVINO would be a separate, large effort. |
| **Phase inversion** | No trained model; simple tensor ops. No gain from OpenVINO. |
| **Demucs subprocess (PyTorch)** | Primary 4-stem path after SCNet; OpenVINO does not apply. |
| **AMD / ARM (e.g. Graviton)** | OpenVINO is optimized for Intel. On AWS Graviton or AMD, ORT CPU (or other EPs) may be better. |

### 3.3 Trade-offs

| Pros | Cons |
|------|------|
| Possible 2–4× CPU speedup for ONNX models (if your models and hardware match benchmarks). | Gains are **not guaranteed** for every model; must benchmark. |
| Minimal code change if using OpenVINO EP (keep existing ONNX APIs). | Extra dependency and build/runtime matrix (ORT + OpenVINO versions; Linux/WSL/Windows). |
| Better use of Intel CPU features (AVX, VNNI, etc.). | Useless or worse on non-Intel (e.g. Graviton); need fallback to CPUExecutionProvider. |
| Same model files (no conversion) when using EP. | If you convert ONNX→IR for “full” OpenVINO, you add a conversion and two paths to maintain. |

---

## 4. Recommendation

### 4.1 Summary

- **Yes, the project can benefit from OpenVINO** in the sense that:
  - The main stem path is **ONNX-heavy** (MDX, optional SCNet, Silero VAD); 4-stem Demucs is **PyTorch**.
  - The stack is **CPU-first** and already tuned for CPU; a faster CPU backend for the same models is aligned with project goals.
  - Integration can be **low-effort** by using the **OpenVINO Execution Provider** for ONNX Runtime instead of replacing the pipeline.

- **Whether it actually helps** depends on:
  - **Hardware:** Intel CPU (e.g. EC2 with Intel instances) → worth trying; AMD/ARM → stick with default ORT CPU or other EPs.
  - **Measured gain:** You must **benchmark** your actual models (Kim_Vocal_2, Inst_HQ_4/5, SCNet if used, silero_vad) on your target machine. Published 3–4× numbers are for other architectures; audio separation may differ.
  - **Operational cost:** Willingness to add OpenVINO dependency and version pairing (ORT + OpenVINO) and to keep a fallback (e.g. CPUExecutionProvider when OpenVINO not available or on non-Intel).

### 4.2 Suggested approach (incremental)

1. **Benchmark baseline**  
   On a representative Intel EC2 (or your target CPU), measure end-to-end time and, if possible, per-model time for:
   - 2-stem (MDX vocal + inst or phase inversion),
   - 4-stem (SCNet or PyTorch Demucs — benchmark separately),
   - Optional: VAD-only.
   Use current `onnxruntime` with `CPUExecutionProvider` and your existing env (e.g. `ONNXRUNTIME_NUM_THREADS`).

2. **Add OpenVINO EP as an option**  
   - Install `openvino` (and, if needed, `onnxruntime-openvino` or the ORT build that includes OpenVINO EP).  
   - In `stem_service/config.py`, extend `get_onnx_providers()` so that on Intel (or when an env flag like `USE_OPENVINO=1` is set), the provider list includes the OpenVINO EP before `CPUExecutionProvider`.  
   - Keep fallback to `CPUExecutionProvider` when OpenVINO is unavailable or disabled.

3. **Re-run the same benchmarks** with OpenVINO EP enabled and same thread/parallelism settings (or document any OpenVINO-specific tuning).

4. **Decide**  
   - If you see a clear win (e.g. ≥1.5× faster) and deployment is Intel: document OpenVINO as the preferred CPU backend and keep the fallback.  
   - If gain is small or deployment is mixed (Intel + non-Intel): keep it optional behind `USE_OPENVINO` and default to ORT CPU.

5. **Do not** (for now) convert Ultra/RoFormer to OpenVINO or replace PyTorch data prep (STFT, resample) with OpenVINO unless you have a separate, high-value use case.

### 4.3 When not to prioritize OpenVINO

- Deployment is mostly **AWS Graviton (ARM)** or **AMD**: focus on ORT CPU and any ARM/AMD-specific optimizations instead.
- You cannot **benchmark** or maintain an extra dependency: stay on ORT-only and continue optimizing via existing levers (VAD pre-trim, ONNX-first, quantization, thread env vars).
- **Ultra quality** is the main bottleneck: OpenVINO does not address PyTorch RoFormer; consider GPU or a different model/backend for that path.

---

## 5. References

- ONNX Runtime – OpenVINO Execution Provider: https://onnxruntime.ai/docs/execution-providers/OpenVINO-ExecutionProvider.html  
- OpenVINO docs (benchmarks, benchmark tool): https://docs.openvino.ai/  
- Project: `docs/ONNX-EFFICIENCY-INVESTIGATION.md`, `docs/CPU-OPTIMIZATION-TIPS.md`, `stem_service/config.py` (`get_onnx_providers()`), `stem_service/requirements.txt`.
