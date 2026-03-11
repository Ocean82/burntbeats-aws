# Investigation: Song Load & Stem Separation Flow

**Date:** March 10, 2025  
**Scope:** What happens when a song is loaded, when stem separation completes, correct models/stages, stem save paths, frontend display, and user interaction with stems.

---

## 1. What happens when a song is loaded

### Intended behavior

- User selects or drops an audio file → file is associated with the session.
- User chooses stem count (2 or 4) and quality (quality vs speed), then clicks **Split and Generate Stem Rack**.
- Backend receives the file only at split time, runs separation, returns stem URLs; frontend shows stems and loads them for playback/mix/export.

### Actual flow (matches intent)

| Step | Location | What happens |
|------|----------|----------------|
| **1. Select file** | `frontend/src/App.tsx`: file input (lines 1031–1039), drop zone (801, 807) | User clicks or drops → `handleFile(file)` runs. |
| **2. handleFile** | `App.tsx` 634–642 | Sets `uploadName`, `uploadedFile`, clears `splitResultStems` and `splitError`. **No upload yet**; file stays in React state. |
| **3. Split trigger** | User clicks "Split and Generate Stem Rack" → `triggerSplit()` (644–668) | Calls `splitStems(uploadedFile, stemCount, splitQuality)` from `api.ts`. |
| **4. API call** | `frontend/src/api.ts` 26–62 | `POST` to `${API_BASE}/api/stems/split` with `FormData`: `file`, `stems` ("2" \| "4"), `quality` (if set). 15 min timeout. Returns `SplitResponse`: `job_id`, `status`, `stems: [{ id, url }]`. |
| **5. Backend** | `backend/server.js` | `multer.diskStorage()` streams the upload to a temp file (no full-file buffer in memory). Proxies to `${STEM_SERVICE_URL}/split` using `form-data` + `createReadStream(filePath)` so the file is streamed from disk to Python. Temp file is unlinked in `finally`. 500MB limit. |
| **6. Stem service** | `stem_service/server.py` 56–115 | Receives file, `stems`, `quality`. Creates `job_id`, `out_dir = OUTPUT_BASE / job_id`, saves upload to `out_dir / (filename or "input.wav")`. Runs hybrid or demucs_only pipeline; returns `job_id`, `status: "completed"`, `stems: [{ id, path }]` (path relative to `OUTPUT_BASE`). |

**Conclusion:** Song “load” is correct: file is chosen in UI, then sent once at split time. No separate upload step; design is intentional.

---

## 2. What happens when stem separation completes

### Backend choice (Python)

- **`STEM_BACKEND`** (env, default `"hybrid"`): `config.py` line 35.
- **Hybrid:** Stage 1 vocals → phase inversion → Stage 2 Demucs on instrumental. Used for both 2-stem and 4-stem unless `STEM_BACKEND=demucs_only`.
- **demucs_only:** Single Demucs run (2- or 4-stem), then `copy_stems_to_flat_dir`.

### Stage 1 (vocals only) – models and process

| Mode | Intended | Actual | Correct? |
|------|----------|--------|---------|
| **Quality** (`quality` ≠ `"speed"`) | Prefer ONNX vocal model for better separation; fallback Demucs 2-stem. | `vocal_stage1.py`: if not `prefer_speed`, tries `run_vocal_onnx()` (segment_size=256, overlap=2). ONNX model: first found of `Kim_Vocal_2.onnx`, `UVR-MDX-NET-Voc_FT.onnx` under `mdxnet_models/`, `models/`, or `MDX_Net_Models/`; config from `model_data.json`. On failure or missing model → `_run_demucs_two_stem()`. | Yes. |
| **Speed** (`quality === "speed"`) | Faster path: no ONNX, Demucs 2-stem only; optional VAD trim. | `extract_vocals_stage1(..., prefer_speed=True)` skips ONNX and calls `_run_demucs_two_stem()` only. Optional VAD pre-trim when `prefer_speed` and `USE_VAD_PRETRIM` set (`hybrid.py` `_effective_input_path`). | Yes. |

**Stage 1 output (hybrid):**

- Demucs 2-stem: `out_dir/stage1/htdemucs/<track_name>/vocals.wav` and **`no_vocals.wav`**.
- ONNX: `out_dir/stage1/onnx_vocals.wav` only (no model-native instrumental).

**Instrumental source (important for quality):**

- **When Stage 1 is Demucs:** Instrumental is taken from the **model-native `no_vocals.wav`** (same model, phase-aligned). `hybrid.py` copies it to `out_dir/instrumental.wav`; no subtraction.
- **When Stage 1 is ONNX:** Instrumental is produced by **phase inversion** (`original − vocals`) in `phase_inversion.py`, with strict alignment: same length as original (pad/trim vocal), same sample rate (resample if needed), same channel count (broadcast mono→stereo if needed) to avoid artifacts from padding/latency mismatch.

### Stage 2 (4-stem on instrumental)

| Intended | Actual | Correct? |
|----------|--------|----------|
| Run Demucs 4-stem (htdemucs) on the instrumental. | `hybrid.py`: instrumental is either Stage 1 `no_vocals` (Demucs path) copied to `instrumental.wav`, or from `create_perfect_instrumental(...)` (ONNX path); then `run_demucs(instrumental_path, stage2_out, stems=4, ...)`. `split.py` uses `python -m demucs -n htdemucs` (no `--two-stems`). | Yes. |

**Stage 2 output:** `out_dir/stage2/htdemucs/<track_name>/{vocals,drums,bass,other}.wav`. Hybrid pipeline then copies drums, bass, other (and vocals from Stage 1) into the flat stems dir.

### Models in use

- **Stage 1:**  
  - Quality: ONNX (Kim_Vocal_2 or UVR-MDX-NET-Voc_FT) when available and config present; else **htdemucs** 2-stem (`--two-stems vocals`).  
  - Speed: **htdemucs** 2-stem only.
- **Stage 2:** **htdemucs** 4-stem (same `models/htdemucs.pth` or `.th`).
- **demucs_only path:** **htdemucs** only (2- or 4-stem in one run).

So: correct AI models and process are used in Stage 1 and Stage 2 as designed.

---

## 3. Where stems are saved vs where they should be

### Contract (intended)

- Python writes under a single output base; Node serves that same directory so `GET /api/stems/file/:job_id/:stemId` returns the WAVs Python wrote.
- Final stems must live under `{STEM_OUTPUT_DIR}/{job_id}/stems/*.wav`.

### Environment and defaults

| Component | Env | Default | Resolved path |
|-----------|-----|---------|----------------|
| **Python** | `STEM_OUTPUT_DIR` | `REPO_ROOT / "tmp" / "stems"` | e.g. `d:\burntbeats-aws\tmp\stems` |
| **Node** | `STEM_OUTPUT_DIR` | `path.join(__dirname, "..", "tmp", "stems")` | Same repo `tmp/stems` when unset |

If both leave `STEM_OUTPUT_DIR` unset, they point to the same directory. If set, they **must** be set to the same path.

### Per-job layout

| Backend | Intermediate (stage) paths | Final flat stems (served by API) |
|---------|-----------------------------|-----------------------------------|
| **demucs_only** | `out_dir/htdemucs/<track_name>/*.wav` | `out_dir/stems/<stem_id>.wav` |
| **hybrid 4-stem** | `out_dir/stage1/...`, `out_dir/instrumental.wav`, `out_dir/stage2/htdemucs/...` | `out_dir/stems/vocals.wav`, `drums.wav`, `bass.wav`, `other.wav` |
| **hybrid 2-stem** | Same stage1 + `instrumental.wav` | `out_dir/stems/vocals.wav`, `instrumental.wav` |

**Conclusion:** Stems are saved where they should be: `{STEM_OUTPUT_DIR}/{job_id}/stems/*.wav`. Backend serves exactly that path (`server.js` 66–75: `path.join(STEM_OUTPUT_DIR, job_id, "stems", safeStem)`). No mismatch.

---

## 4. How stems are displayed on the frontend

### After split completes

1. **State:** `setSplitResultStems(res.stems)` with `res.stems` from backend (each has `id`, `url`).
2. **Visible list:** `visibleStems = useMemo(...)` — when `splitResultStems.length > 0`, it maps `splitResultStems` to `{ ...getStemDefinition(s.id), id, url }`. So only stems returned by the split are shown, with labels and URLs.
3. **Loading:** `useEffect` runs `loadStemsIntoBuffers()` when `splitResultStems.length > 0`. For each stem, `fetch(stem.url)` → `decodeAudioData` → `stemBuffers[stem.id]`.
4. **Rendering:** `visibleStems.map(...)` → one **StemCard** per stem (lines 1097–1138). Each card gets stem metadata (from `getStemDefinition`), `trim`, `mixerState`, and callbacks.

### Waveform display

- **WaveformEditor** uses **real** waveform when available: after decode, `computeWaveformFromBuffer(buffer, 1024)` builds a peak envelope; stored in `stemWaveforms` and optionally cached in IndexedDB by stem URL. Fallback: preset `stem.waveform` (72 bars). Trim overlay is driven by `trim` state (start/end %) over the same envelope so trim matches audible content and export.

**Summary:** Stems are displayed as cards with real or preset waveforms and real trim/mixer; playback and export use the real buffers from `stem.url` with sample-boundary trim.

---

## 5. How the user can interact with stems after they are rendered

| Action | Handler | Behavior |
|--------|---------|----------|
| **Hear (preview)** | `onPreview` → `handlePreviewStem(stem.id, stemUrl)` | Play/stop single stem from `stemBuffers[stemId]` or fetch `stemUrl` and decode; play via `AudioBufferSourceNode` + Gain. |
| **Solo** | `onSolo` → `setSoloStems(...)` | If any stem is soloed, only soloed stems are in the mix (play and export); otherwise per-track mute applies. Multiple stems can be soloed. |
| **Mute** | `onMute` → `setMutedStems(...)` | Muted stems excluded from “Play mix” and from export when no solo is active. |
| **Download** | `onDownload` → `window.open(stemUrl, "_blank")` | Only when `stemUrl` exists (after split). Opens stem WAV in new tab. |
| **Trim** | `onTrimChange` → `setTrimMap(...)` | Start/end % converted to sample-boundary times via `trimToSeconds()`; same window used for Play mix and export so waveform, playback, and exported WAV match. |
| **Level & pan** | `onMixerChange` → `setMixerState(...)` | Gain (dB) and pan applied in Play mix and export. |
| **Play mix** | `handlePlayMix` | Builds list from `splitResultStems` (soloed-only if any solo, else non-muted), plays each from `stemBuffers` with sample-accurate trim and mixer, synced start. |
| **Export WAV** | `exportMasterWav` | Renders mix in `OfflineAudioContext(2, frames, 44100)` from soloed or non-muted stems (same rule as play) with sample-accurate trim and mixer → WAV blob → download `{uploadName}_master.wav`. |
| **Load to tracks** | “Load to tracks” → `loadStemsToTracks` → `loadStemsIntoBuffers()` | Re-fetches/decodes stems into `stemBuffers` if needed (same as auto-load after split). |

So the user can preview, solo, mute, trim, level/pan, play full mix, export master, and download individual stems; behavior is consistent with the data flow.

---

## 6. Gaps and recommendations

### 6.1 Progress bar is not tied to backend

- **Actual:** Split progress is a local timer (e.g. to 85% over ~2.8s) in `App.tsx` (useEffect with `requestAnimationFrame`). It does not reflect real separation progress.
- **Recommendation:** If the stem service ever exposes progress (e.g. SSE or polling), wire the progress bar to it; otherwise consider labeling it as “Estimating…” or hiding the percentage.

### 6.2 Waveform from stem audio (addressed)

- **Actual:** After load, `computeWaveformFromBuffer(buffer, 1024)` builds a peak envelope per stem; stored in `stemWaveforms` and passed to `WaveformEditor` as `realWaveform`. IndexedDB caches by stem URL to avoid recompute on remount. Preset waveform used only before decode.

### 6.3 STEM_OUTPUT_DIR must match

- **Actual:** Python and Node default to the same repo-relative path; no check that they match.
- **Recommendation:** Document clearly that if `STEM_OUTPUT_DIR` is set, it must be identical for both services; optionally add a health check or startup log that prints the resolved path so deployers can verify.

### 6.4 Quality parameter and multer

- **Actual:** Backend reads `quality` from `req.body`. With `multer.single("file")`, other form fields are typically on `req.body`; this is correct.
- **Recommendation:** No change required; if adding more form fields, keep using multer’s `req.body` for non-file fields.

---

## 7. Stems pathing and serving (single source of truth)

- **Python writes:** `{STEM_OUTPUT_DIR}/{job_id}/stems/*.wav` ✅  
- **Node serves from same dir:** `GET /api/stems/file/:job_id/:stemId.wav` → `path.join(STEM_OUTPUT_DIR, job_id, "stems", stemId)` ✅  

This is the intended design: one output directory, backend serves exactly what the stem service wrote.

**Two operational items to implement:**

1. **Cleanup policy** – Implemented: `scripts/cleanup-stems.js` (run manually or from cron) and `GET /api/stems/cleanup?maxAgeHours=24`. Both delete job dirs (UUID-named only) older than the given hours. Env: `STEM_OUTPUT_DIR`, `STEM_CLEANUP_MAX_AGE_HOURS` (script only).
2. **Path traversal hardening** – Implemented in `backend/server.js`: `job_id` must match UUID regex; `stemId` allowlist `vocals`, `drums`, `bass`, `other`, `instrumental`. Returns 400 on invalid params.

---

## 8. No valid reason—recommended next steps

There is no documented or technical reason the progress bar and waveform use fake data; both were simply never wired to real sources. Recommended next steps:

### Progress bar (real-time from backend)

- **Current:** Frontend timer 0→85% over ~2.8s; backend has no progress API.
- **Backend:** Add a way to report progress (e.g. run separation in a background worker, store progress 0–100 or by stage, expose via `GET /api/stems/status/:job_id` or SSE). If demucs/ONNX expose progress (e.g. per segment), pipe that into the same status.
- **Frontend:** When `isSplitting` is true, poll `GET /api/stems/status/:job_id` (or subscribe to SSE) and set `splitProgress` from the response; when status is `completed`, set 100% and stop polling. Remove or repurpose the local timer.

### Waveform (real data from decoded stems)

- **Current:** `WaveformEditor` uses `stem.waveform` from preset `stemDefinitions` (synthetic). Real audio is in `stemBuffers` after fetch/decode.
- **Frontend:** After stems are in `stemBuffers`, compute a waveform (e.g. max or RMS per 50–100 bins) from each `AudioBuffer` (e.g. from `getChannelData(0)`), store in state (e.g. `stemWaveforms: Record<string, number[]>`), and pass that into `WaveformEditor` instead of `stem.waveform`. Keep preset waveform as fallback when no buffer/waveform exists yet.

### Concrete code touchpoints

| Change | Where |
|--------|--------|
| Job status endpoint or SSE | `backend/server.js` (new route); stem service or worker must write progress (new Python endpoint or in-process state). |
| Poll/SSE in frontend | `App.tsx`: inside `triggerSplit`, after starting split request you need a job_id (may require split to return job_id immediately and complete in background, or a two-phase API). Alternatively: single long request with chunked/streaming response carrying progress. |
| Waveform from buffer | New util e.g. `computeWaveformFromBuffer(buffer: AudioBuffer, bins: number): number[]`; call from `loadStemsIntoBuffers` or in a `useEffect` when `stemBuffers[stem.id]` is set; store in `stemWaveforms`; pass to `StemCard`/`WaveformEditor` as `waveform={stemWaveforms[stem.id] ?? stem.waveform}`. |

---

## 9. Sample rate and stem alignment

### Sample rate

- **Frontend:** Export uses `OfflineAudioContext(2, frameCount, 44100)`; all stems are mixed at 44.1 kHz. Playback uses the default `AudioContext` (may be 48 kHz on some devices); Web Audio resamples decoded buffers as needed.
- **Stem service:** `config.py` defines `TARGET_SAMPLE_RATE = 44100`. ONNX vocal path writes 44.1k; Demucs output is model-native (htdemucs typically 44.1k). Phase inversion preserves original input rate. For consistent mix alignment and to avoid drift, any new writers should resample to `TARGET_SAMPLE_RATE` when writing final stems.

### Latency and alignment

- Stems from the same job are produced in one pipeline; Demucs outputs same length per stem, and phase inversion is length- and channel-aligned. So stems should start at 0 with the same length in practice.
- If you hear **flamming**, **hollow instrumental**, or **weird stereo collapse**, the usual cause is alignment: different stem lengths, different leading silence, or sample-rate mismatch. Mitigations: (1) enforce a single output sample rate (e.g. 44.1k) in the stem service; (2) keep instrumental from the same model when possible (Demucs `no_vocals`); (3) when using phase inversion, use strict length/channel/sample-rate alignment (as in `phase_inversion.py`).

---

## 10. Quick reference

| Topic | Where |
|-------|------|
| Song load / file select | `App.tsx`: file input, drop zone, `handleFile` |
| Split trigger | `App.tsx`: `triggerSplit` → `splitStems()` |
| Split API | `api.ts`: `splitStems()` → `POST /api/stems/split` |
| Backend proxy & serve | `backend/server.js`: POST to stem service; GET `STEM_OUTPUT_DIR/job_id/stems/:stemId.wav` |
| Stem service entry | `stem_service/server.py`: `/split` → hybrid or demucs_only |
| Stage 1 | `vocal_stage1.py`: ONNX (quality) or Demucs 2-stem (speed); `mdx_onnx.py` for ONNX |
| Stage 2 | `split.py`: `run_demucs(..., stems=4)` (htdemucs) |
| Models | htdemucs (`.pth`/`.th`); ONNX: Kim_Vocal_2, UVR-MDX-NET-Voc_FT + model_data.json |
| Stems save dir | `STEM_OUTPUT_DIR` (default `tmp/stems`); per job `{id}/stems/*.wav` |
| Frontend display | `splitResultStems` → `visibleStems` → StemCard; `loadStemsIntoBuffers` → `stemBuffers`; real waveform from `stemWaveforms` |
| Solo/Mute | If any stem soloed → only soloed in play/export; else per-track mute. Multiple solos supported. |
| Trim | `trimToSeconds(buffer, trim)` → sample-boundary start/end; same for play and export. |
| User actions | Hear, Solo, Mute, Download, Trim, Level/Pan, Play mix, Export WAV, Load to tracks |
