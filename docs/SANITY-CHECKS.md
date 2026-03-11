# High-value sanity checks

**Date:** March 10, 2025  
Run these to validate the full flow. Manual steps; automate where noted.

---

## 1. Large file upload (100–300 MB)

**Goal:** Node memory stable; file streams to Python without loading full file into memory in either process.

**What to verify**

- Node RSS stays bounded during upload (no spike to file size).
- Python RSS stays bounded (no full-file read).
- Split completes and stems are correct.

**How**

1. Use a 100–300 MB WAV (e.g. long mix or 24-bit multi‑minute).
2. Before: note Node and Python process RSS (Task Manager / `ps` / `top`).
3. Upload and start split; watch RSS during upload and while Python receives.
4. After split completes, confirm stems play and export.

**Code touchpoints**

| Layer | Behavior |
|-------|----------|
| **Node** | `backend/server.js`: `multer.diskStorage()` writes to `os.tmpdir()/burntbeats-upload`; proxy uses `createReadStream(filePath)` + `form-data`, so no full buffer. Limit 500 MB. |
| **Python** | `stem_service/server.py`: upload saved with streaming `while chunk := await file.read(1024*1024): f.write(chunk)` so Python never holds full file. |

**Pass:** No large RSS spike in Node or Python during upload; split succeeds.

---

## 2. Back-to-back splits

**Goal:** Each job has a unique `job_id`; outputs don’t collide; cleanup only removes old job dirs.

**What to verify**

- Every split returns a different UUID.
- Each job’s stems live under `{STEM_OUTPUT_DIR}/{job_id}/stems/` and don’t overwrite another job.
- Cleanup deletes only UUID-named dirs older than the given age.

**How**

1. Start two splits in quick succession (same or different files). Note both `job_id`s; confirm they differ.
2. After both complete, check `tmp/stems/` (or your `STEM_OUTPUT_DIR`): two dirs, names = the two UUIDs; each contains its own `stems/*.wav`.
3. Call `GET /api/stems/cleanup?maxAgeHours=0` (or run `node scripts/cleanup-stems.js 0`). Only UUID-named dirs should be removed; no other dirs in `STEM_OUTPUT_DIR` touched.

**Code touchpoints**

| Layer | Behavior |
|-------|----------|
| **Python** | `server.py`: `job_id = str(uuid.uuid4())`, `out_dir = OUTPUT_BASE / job_id`. |
| **Node cleanup** | `server.js` and `scripts/cleanup-stems.js`: list dirs, delete only if `UUID_REGEX.test(ent.name)` and `mtime < cutoff`. |

**Pass:** Unique job IDs; separate dirs per job; cleanup only removes old UUID dirs.

---

## 3. Instrumental subtraction quality

**Goal:** When Stage 1 is Demucs, instrumental is model-native (`no_vocals`); when Stage 1 is ONNX, instrumental is phase inversion. Compare quality where both paths are possible.

**What to verify**

- Demucs path: instrumental = copy of Demucs `no_vocals` (phase-aligned).
- ONNX path: instrumental = original − vocals with strict length/channel/sr alignment (no obvious phasing/hollowness).
- If you have a track where both can run, A/B: same track with “quality” (ONNX if available) vs “speed” (Demucs 2-stem); compare instrumental clarity and phase.

**How**

1. **Speed path (Demucs 2-stem):** Split with quality = speed. In `{job_id}/stems/` use `instrumental.wav`; it was copied from `stage1/htdemucs/.../no_vocals.wav` (see `hybrid.py`).
2. **Quality path (ONNX):** Split with quality ≠ speed (and ONNX model present). Instrumental is from `phase_inversion.py` (original − aligned vocals). Listen for hollow/phasey artifacts.
3. Optional: same song, run both; compare instrumentals in a DAW (phase, low-end, stereo).

**Code touchpoints**

| Component | Behavior |
|-----------|----------|
| `stem_service/hybrid.py` | If `stage1_instrumental` is not None (Demucs), copy to `instrumental.wav`; else `create_perfect_instrumental(...)`. |
| `stem_service/phase_inversion.py` | Align vocal to original length (pad/trim), channels (broadcast mono→stereo), sample rate; then instrumental = original − vocal. |

**Pass:** Demucs instrumental is clean (native); ONNX instrumental has no obvious phase/hollow issues (or you document known limits).

---

## 4. Waveform matches trim / export

**Goal:** Trim a transient-heavy region; confirm exported WAV is exactly the window the UI shows (sample-accurate, same as playback).

**What to verify**

- Waveform is from decoded audio (peak envelope, 1024 bins).
- Trim start/end (percent) map to sample-boundary times via `trimToSeconds()`; play and export use the same times.
- Exported file’s content matches the trimmed region (no off-by-one or wrong segment).

**How**

1. Split a track; wait for stems and real waveforms to load.
2. Pick a stem with clear transients (e.g. drums). Set trim so the visible window contains one or two obvious hits (e.g. 20%–45%).
3. Play mix: confirm you hear only that region.
4. Export WAV. Open in Audacity/DAW; confirm the exported file starts and ends at the same logical points (same transients at start/end as in the UI).
5. Optionally: trim to a very short window (e.g. 50%–52%); export and confirm length ≈ 2% of original duration.

**Code touchpoints**

| Component | Behavior |
|-----------|----------|
| `frontend/src/App.tsx` | `trimToSeconds(buffer, trim)` → `trimStart`/`trimEnd` from sample indices; used in `handlePlayMix` and `exportMasterWav`. `source.start(0, trimStart, trimStart + playDuration)`. |
| Waveform | `stemWaveforms` from `computeWaveformFromBuffer(..., 1024)`; overlay shows trim % over same envelope. |

**Pass:** Exported WAV matches the trimmed segment shown in the UI; playback and export use the same window.

---

## 5. Export WAV correctness

**Goal:** Peak levels (no unintended clipping), pan law consistent, stems time-aligned in the mix.

**What to verify**

- With default or moderate gains, mix doesn’t clip (or document that user gain can push over 0 dB).
- Pan left/right behaves as expected (StereoPanner -1..1; we use `mixer.pan / 20`).
- All stems start at t=0 in the mix; trimmed regions align (no flamming).

**How**

1. **Peak levels:** Split; leave gains at default. Export; open in Audacity, check peak meter. If any sample > 1.0 before export, Web Audio will clip. Optional: add a “Normalize export” or limiter (future).
2. **Pan:** Set one stem hard left (pan ≈ -1), one hard right (pan ≈ +1). Export; confirm stereo image matches. Pan law is Web Audio’s StereoPanner (equal power).
3. **Alignment:** Export with all stems; zoom to start in a DAW; confirm all stems start at 0 and trimmed regions line up (no obvious offset between e.g. drums and bass).

**Code touchpoints**

| Component | Behavior |
|-----------|----------|
| `frontend/src/App.tsx` | Export: `OfflineAudioContext(2, exactFrameCount, 44100)`; each stem `source.start(0, trimStart, trimStart + playDuration)` so all start at 0 in context time. Gain = `10^(dB/20)`; pan = `mixer.pan / 20` (-1..1). No limiter or normalize; sum can clip if gains are hot. |
| `audioBufferToWav` | Clamps each sample to [-1, 1] when writing int16; so WAV doesn’t overflow, but mix can already be clipped in the rendered buffer. |

**Pass:** Stereo and alignment correct; peaks reasonable at default gains (or document clipping when user raises gains).

---

## Quick reference

| Check | Key question | Pass condition |
|-------|----------------|----------------|
| 1. Large upload | Node/Python memory stable? | No full-file spike; stream to disk both sides. |
| 2. Back-to-back | job_id unique; no collision; cleanup safe? | Unique UUIDs; separate dirs; cleanup only UUID dirs. |
| 3. Instrumental | Subtraction vs model-native quality? | Demucs = no_vocals; ONNX = aligned subtraction; A/B acceptable. |
| 4. Waveform/trim/export | Does export match UI trim? | Same sample-boundary window; export matches playback. |
| 5. Export WAV | Clipping? Pan? Alignment? | Peaks OK at default; pan consistent; stems start at 0. |
