# Architecture: server / client / billing / ops

**Last updated:** 2026-05-03

This document is the **product contract** for how Burnt Beats splits audio, stores stems, bills usage, exports audio, and keeps the system tidy.

---

## 1. Server responsibilities

| Concern | Behavior |
|--------|----------|
| **Upload** | Browser → Node API (`POST /api/stems/split`) → Python **stem service** receives the file (streaming to disk where applicable). |
| **AI stem splitting** | Runs in **`stem_service`** (CPU/GPU inference depends on host; Node does not run the model). |
| **Storage** | Stems are written under **`STEM_OUTPUT_DIR`**. With **`S3_ENABLED=true`** (and **`boto3`**), **`stem_service/s3_upload.py`** uploads `stems/*.wav` after each job and stores **`s3`** metadata (bucket, region, per-stem keys) in **`progress.json`**. The Node API then **302 redirects** **`GET /api/stems/file/...`** to a **presigned S3 URL** (`backend/s3Presign.js`). Optional **`S3_DELETE_LOCAL_AFTER_UPLOAD`** removes local WAVs after upload (backend must have AWS creds to presign). |
| **API surface** | **202** acceptance; **`GET /api/stems/status/:job_id`** reads `progress.json`; **`GET /api/stems/file/...`** → presigned S3 redirect when `progress.s3` is set, else **streams from disk**. |
| **Auth** | Optional **`x-api-key`**, **Clerk Bearer** when usage tokens are enabled (`USAGE_TOKENS_ENABLED`), optional **`x-job-token`** per job. |

---

## 2. Client (browser) responsibilities

| Concern | Behavior |
|--------|----------|
| **Download stems** | `fetch` stem URLs → **ArrayBuffer** → **`decodeAudioData`** → **`AudioBuffer`** per track. |
| **Waveform / mixer / scrub / automation** | **100% client-side** (Web Audio, `OfflineAudioContext` for preview/export paths where applicable). |
| **Default master export** | **WAV** rendered in-browser (`OfflineAudioContext` + `audioBufferToWav` in `frontend/src/hooks/useExport.ts`). **No server round-trip** for this path. |
| **Master MP3 (client)** | Render master WAV, then encode with **`lamejs`** (`useExport.ts`). |
| **Bundles (client)** | Optional **ZIP** (JSZip): includes master file (format per choice) + individual **WAV** stems fetched from job URLs (`/api/stems/file/...`). “Load stems” / non-job tracks may have **no** server file URL — bundles are only reliable for **job-backed** stems (see `useExport.ts`). |
| **Optional server-side master WAV** | `POST /api/stems/server-export` when **`SERVER_EXPORT_ENABLED=1`** on the backend. If disabled, responds **404** with JSON directing operators to client export. Spawned **`stem_service/server_export.py`** reads STEM output, applies an **offline DSP chain** (SciPy/numpy stack — **not** sample-identical to Web Audio); returns a downloaded `.wav`. The frontend attempts this only when **`VITE_SERVER_EXPORT_ENABLED`** matches; otherwise or on 404 during master **WAV**, it stays on client render (`useExport.ts`). |

---

## 3. Billing (usage tokens)

**Tokens meter expensive server-side work** (compute + I/O tied to separation / optional server export / speech enhancement / MIDI conversion). Client mixing, polling, downloads of already-generated stems, and **client-side** master export paths are unmetered.

| Action | Tokens? |
|--------|--------|
| **Split** (`POST /api/stems/split`) | Yes — when `USAGE_TOKENS_ENABLED`, proportional to **source duration** (1 token ≈ 1 minute of audio, partial minutes round up). See `backend/usageTokens.js`. |
| **Expand** (`POST /api/stems/expand`) | Yes — same minute-based rules. |
| **Speech enhance** (`POST /api/speech/enhance`) | Yes — duration-based (same as split). |
| **MIDI convert** (`POST /api/midi/convert`) | Yes — flat **0.5 tokens** per conversion (configurable via `MIDI_TOKEN_COST`). Refunded on proxy failure. |
| **Server-side master export** (`POST /api/stems/server-export`) | Yes — when **`SERVER_EXPORT_ENABLED`** and **`USAGE_TOKENS_ENABLED`** (duration-based reservation; failure paths refund where applicable — see `backend/server.js` + `usageTokens.js`). |
| **Poll status, download stem/speech/midi files, mix, edit, client master / MP3 / ZIP export** | **No** |

Subscriptions and monthly credits: Stripe + Clerk webhook (`docs/BILLING-AND-TOKENS.md`).

---

## 4. Ops (background jobs, polling, TTL)

| Concern | Behavior |
|--------|----------|
| **Async jobs** | Stem service returns **202** with `job_id`; work runs in a background task / queue worker. Speech and MIDI services follow the same pattern (202 → poll → file serve). |
| **Progress** | Client polls **`GET /api/stems/status/:job_id`** until `completed` / `failed`. Same for **`/api/speech/status/:id`** and **`/api/midi/status/:id`**. |
| **TTL cleanup** | **`POST /api/stems/cleanup?maxAgeHours=…`** (requires **`API_KEY`**) deletes job dirs under `STEM_OUTPUT_DIR` **older than** the threshold, plus old upload temp files. **`POST /api/midi/cleanup?maxAgeHours=…`** does the same for MIDI output. Default **`maxAgeHours`** comes from **`STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS`** / **`MIDI_CLEANUP_DEFAULT_MAX_AGE_HOURS`** (fallback **24**). Run from **cron** in production (e.g. nightly). **S3:** delete objects separately (e.g. lifecycle rule on prefix `stems/`) if you no longer keep local copies. |
| **S3 CORS** | If the browser loads presigned URLs directly, configure the bucket **CORS** to allow **`GET`** from your app origin (or tests may fail for `<audio src>` / `fetch`). |
| **Server export temps** | Node writes transient render output under **`/tmp/burntbeats-server-export/`** before `res.download`; files are cleaned up after send. |

---

## 5. 4-stem speed policy

| Concern | Behavior |
|--------|----------|
| **Fast 4-stem model** | Uses **Demucs rank 28 only**: `speed_4stem_rank28/cfa93e08-61801ae1.th` |
| **Fast 4-stem fallback** | **Disabled by policy** (no speed fallback checkpoint) |
| **Model root** | When `STEM_MODELS_DIR=server_models`, runtime resolves from `/repo/server_models` |

## 6. Locked model quality/latency policy

| Concern | Behavior |
|--------|----------|
| **Model selection authority** | Use only ranked, user-approved checkpoints; no lower-quality substitutions. |
| **Stage 1 passes** | Keep single-pass default. Do not add vocal+instrumental dual ONNX passes in production unless policy changes. |
| **Instrumental strategy** | Often phase inversion (`original − vocals`) when no dedicated instrumental checkpoint. |
| **Latency protection** | Do not add extra quality passes that materially increase wait time unless explicitly approved. |

Example cleanup (cron):

```bash
curl -sS -H "x-api-key: $API_KEY" \
  "${API_BASE}/api/stems/cleanup?maxAgeHours=48"
```

---

## Related code

| Area | Path |
|------|------|
| Node API + S3 presign + cleanup + server export orchestration | `backend/server.js`, `backend/s3Presign.js` |
| Usage tokens | `backend/usageTokens.js` |
| Stripe / Clerk | `backend/billing.js` |
| Stem jobs + S3 upload | `stem_service/server.py`, `stem_service/s3_upload.py` |
| Server-side offline master render | `stem_service/server_export.py` |
| Speech enhancement routes | `backend/routes/speech/` → `speech_service/server.py` |
| MIDI conversion routes | `backend/routes/midi/` → `midi_service/server.py` |
| Client export | `frontend/src/hooks/useExport.ts` |
| MIDI conversion hook | `frontend/src/hooks/useMidiConvert.ts` |
