# VAD-based chunked separation (vadslice-main)

**Date:** 2026-03-10  
**Purpose:** Decide whether to use `vadslice-main` (VAD → slice at silence → process in chunks) to avoid bottleneck and heavy single-file loads.

---

## 1. What vadslice does

- **Repo:** `D:\burntbeats-aws\vadslice-main` (also [bn-l/vadslice](https://github.com/bn-l/vadslice)).
- **VAD:** Silero VAD via **ONNX** (`silero_vad.onnx` next to the module; no PyTorch). Same idea as our `models/silero_vad.jit` but ONNX-only.
- **Slicing:** Loads the file, resamples to 16 kHz mono, runs VAD, then **cuts only at end-of-speech** boundaries so chunks are ~`slice_length_s` (e.g. 30 s) and never mid-phrase.
- **Output:** List of `AudioPart(part=WAV bytes 16 kHz mono, offset_s=start time)`. Optional `silence_flush_s`: flush a chunk early after a long silence gap.
- **Deps:** `av` (PyAV), `loguru`, `numpy`, `onnxruntime`. Repo does **not** ship `silero_vad.onnx`; the published PyPI package may bundle it.

So vadslice gives you **chunk boundaries in time** (and 16k mono chunk bytes we would not feed to Demucs).

---

## 2. Proposed plan (your idea)

1. Use VAD to find **where there is voice** (and thus where silence / good cut points are).
2. **Cut the song at those silence points** into chunks (e.g. 20–45 s each).
3. Run stem separation **per chunk** (Demucs/hybrid on each chunk).
4. **Concatenate** the stem outputs in order (with optional short crossfade at seams).

**Goals:** Avoid one huge run (memory, timeout), and/or run chunks in parallel to use CPU better.

---

## 3. Is this a wise plan?

**Yes.** It’s a good approach.

| Benefit | Why it helps |
|--------|----------------|
| **Lower peak memory** | Each Demucs run sees a shorter file (e.g. 30–60 s instead of 5–10 min). |
| **Parallelization** | You can run N chunks in parallel (e.g. 4 workers) and merge stems at the end. |
| **Natural boundaries** | Cuts at silence reduce risk of audible clicks or artifacts at chunk seams. |
| **Long-file stability** | Very long tracks are less likely to OOM or hit timeouts when split into chunks. |

**Caveats:**

- **Stitching:** Demucs output is per chunk. You must concatenate stem WAVs in time order. A very short crossfade (e.g. 50–100 ms) at boundaries can avoid tiny clicks if needed.
- **Don’t feed vadslice’s 16k mono to Demucs.** Use vadslice only to get **(offset_s, duration_s)** per chunk, then **slice the original 44.1 kHz stereo** at those times and run Demucs on those slices.
- **Demucs already has internal segmenting** (`--segment 8`). Chunking the **input** is still useful: smaller inputs → smaller memory and the option to run several chunks in parallel.

---

## 4. How to implement (two options)

### Option A: Use vadslice as a library

- **Steps:** Call `vadslice.slicer(path, slice_length_s=30, silence_flush_s=5)` → get `AudioPart` list. For each part, `offset_s` is start time; duration in seconds = `len(part.part)` derived from WAV header (16k mono, 16-bit) or from part size. Slice the **original** file (e.g. with `soundfile` or `torchaudio`) from `offset_s` to `offset_s + duration_s`, write a temp WAV, run Demucs on it, collect stems, then concatenate all stems in order.
- **Deps:** Add `vadslice` (and thus `av`, `loguru`). Ensure `silero_vad.onnx` is available (vadslice expects it next to its module; PyPI package may include it, or you provide it).
- **Pros:** ONNX-only VAD (no PyTorch for VAD), existing logic for “cut at end-of-speech.”  
- **Cons:** New deps; repo doesn’t include the ONNX file.

### Option B: Same idea inside stem_service (recommended)

- **Steps:** Reuse **existing** `stem_service/vad.py` (Silero via `models/silero_vad.jit`). Add a small helper that:
  - Gets speech segments with `get_speech_timestamps(..., return_seconds=True)`.
  - Builds **chunk boundaries** at end-of-speech: target length `slice_length_s` (e.g. 30), optional `silence_flush_s` (e.g. 5), same logic as vadslice (cut when chunk length reached at a speech end, or flush on long silence).
  - Returns `[(start_s, end_s), ...]`.
- Then: for each `(start_s, end_s)`, slice the **original** 44.1k stereo file, write temp WAV, run current pipeline (hybrid or demucs_only) on it, collect stems, concatenate with optional short crossfade.
- **Deps:** None new; we already have VAD and separation.
- **Pros:** No new packages; one VAD story; same chunking semantics as vadslice.  
- **Cons:** VAD stays PyTorch (.jit) unless we later swap in an ONNX VAD.

**Recommendation:** Implement **Option B** first (chunk boundaries from existing VAD + slice original + run separation per chunk + concatenate). Option A remains possible later if you want to move VAD to ONNX-only (e.g. by providing `silero_vad.onnx` and using vadslice only for boundaries).

---

## 5. Integration shape (for Option B)

- **Config:** e.g. `USE_VAD_CHUNKS=1`, `VAD_CHUNK_LENGTH_S=30`, `VAD_CHUNK_SILENCE_FLUSH_S=5` (optional).
- **Flow:** If chunking enabled and VAD available: compute `[(start_s, end_s), ...]` from existing VAD; for each interval, extract slice from original (soundfile/torchaudio), run `run_hybrid_4stem` or `run_demucs` on the slice, append stem outputs; concatenate per-stem WAVs (with optional 50–100 ms crossfade); return final stems as today.
- **Parallel:** Optional worker pool (e.g. `concurrent.futures.ProcessPoolExecutor`) to run N chunks in parallel; then merge in order. Not required for a first version.

---

## 6. Summary

| Question | Answer |
|----------|--------|
| Is the plan (VAD → chunk at silence → render in chunks) wise? | **Yes.** It reduces load and enables parallelization and better long-file behavior. |
| Use vadslice repo as-is? | You can; use it only for **boundaries** (offset_s + duration), then slice the original and run Demucs yourself. vadslice’s 16k mono chunks are not for Demucs. |
| Preferred approach here? | **Option B:** implement the same “chunk at end-of-speech” logic in stem_service using existing Silero VAD; no new deps; then slice original, run separation per chunk, concatenate stems. |

Implementing Option B in `stem_service` (chunk-boundary helper + chunked pipeline + stem concatenation) is the next concrete step.
