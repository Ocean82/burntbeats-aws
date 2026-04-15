# Architecture: server / client / billing / ops

**Last updated:** 2026-04-15

This document is the **product contract** for how Burnt Beats splits audio, stores stems, bills usage, and keeps the system tidy.

---

## 1. Server responsibilities

| Concern | Behavior |
|--------|----------|
| **Upload** | Browser → Node API (`POST /api/stems/split`) → Python **stem service** receives the file (streaming to disk where applicable). |
| **AI stem splitting** | Runs in **stem_service** (GPU/RAM inference). Node does not run the model. |
| **Storage** | Stems are written under **`STEM_OUTPUT_DIR`**. With **`S3_ENABLED=true`** (and **`boto3`**), **`stem_service/s3_upload.py`** uploads `stems/*.wav` after each job and stores **`s3`** metadata (bucket, region, per-stem keys) in **`progress.json`**. The Node API then **302 redirects** **`GET /api/stems/file/...`** to a **presigned S3 URL** (`backend/s3Presign.js`). Optional **`S3_DELETE_LOCAL_AFTER_UPLOAD`** removes local WAVs after upload (backend must have AWS creds to presign). |
| **API surface** | **202** acceptance; **`GET /api/stems/status/:job_id`** reads `progress.json`; **`GET /api/stems/file/...`** → presigned S3 redirect when `progress.s3` is set, else **streams from disk**. |
| **Auth** | Optional **`x-api-key`**, **Clerk Bearer** when usage tokens are enabled (`USAGE_TOKENS_ENABLED`), optional **`x-job-token`** per job. |

---

## 2. Client (browser) responsibilities

| Concern | Behavior |
|--------|----------|
| **Download stems** | `fetch` stem URLs → **ArrayBuffer** → **`decodeAudioData`** → **`AudioBuffer`** per track. |
| **Waveform / mixer / scrub / automation** | **100% client-side** (Web Audio, `OfflineAudioContext` for preview/export paths where applicable). |
| **Default export** | **Master WAV** is rendered in the browser (`OfflineAudioContext` + `audioBufferToWav` in `frontend/src/hooks/useExport.ts`). **No server round-trip** for the default master export. |
| **Optional server export** | Reserved for edge cases (very long files, server-side mastering, compliance). **Not implemented** in the pipeline yet; see `POST /api/stems/server-export` (returns `501` / `404` until built). |

---

## 3. Billing (usage tokens)

**Tokens are charged only for server-side work.**

| Action | Tokens? |
|--------|--------|
| **Split** (`POST /api/stems/split`) | Yes — when `USAGE_TOKENS_ENABLED`, proportional to **source duration** (1 token ≈ 1 minute of audio, partial minutes round up). See `backend/usageTokens.js`. |
| **Expand / re-split** (`POST /api/stems/expand`) | Yes — same minute-based rules. |
| **Future server export** (`POST /api/stems/server-export`) | Will charge when implemented (same duration basis unless product changes). |
| **Poll status, download stem files, mix, edit, client master export** | **No** — not metered. |

Subscriptions and monthly credits: Stripe + Clerk webhook (`docs/BILLING-AND-TOKENS.md`).

---

## 4. Ops (background jobs, polling, TTL)

| Concern | Behavior |
|--------|----------|
| **Async jobs** | Stem service returns **202** with `job_id`; work runs in a background task. |
| **Progress** | Client polls **`GET /api/stems/status/:job_id`** until `completed` / `failed`. |
| **TTL cleanup** | **`POST /api/stems/cleanup?maxAgeHours=…`** (requires **`API_KEY`**) deletes job dirs under `STEM_OUTPUT_DIR` **older than** the threshold, plus old upload temp files. Default **`maxAgeHours`** comes from **`STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS`** (fallback **24**). Run from **cron** in production (e.g. nightly). **S3:** delete objects separately (e.g. lifecycle rule on prefix `stems/`) if you no longer keep local copies. |
| **S3 CORS** | If the browser loads presigned URLs directly, configure the bucket **CORS** to allow **`GET`** from your app origin (or tests may fail for `<audio src>` / `fetch`). |
| **Server FFmpeg export** | **Not implemented** — next step after S3. Reserved: **`POST /api/stems/server-export`**. |

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
| **Stage 1 passes** | Keep single-pass default. Do not add vocal+instrumental dual ONNX passes in production. |
| **Instrumental strategy** | Default is phase inversion (original minus vocals). |
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
| Node API + S3 presign + cleanup | `backend/server.js`, `backend/s3Presign.js` |
| Usage tokens | `backend/usageTokens.js` |
| Stripe / Clerk | `backend/billing.js` |
| Stem jobs + S3 upload | `stem_service/server.py`, `stem_service/s3_upload.py` |
| Client export (default) | `frontend/src/hooks/useExport.ts` |
