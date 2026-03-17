# Docs status and direction

**Date:** 2026-03-17  
**Purpose:** Which docs are current vs archived; what was updated to reflect the latest app (2-stem first, expand to 4, load stems, pitch/time stretch).

---

## Current app (as of 2026-03-17)

- **Source:** Two modes — **Split a track** (upload → quality → split) or **Load stems (mashup)** (add WAV/MP3 files as mixer tracks).
- **Split flow:** Always **2-stem first** (vocals + instrumental). After that, user can **Keep going → 4 stems** (expand: SCNet ONNX when available, else Demucs ONNX/subprocess on instrumental → drums, bass, other) or use the mixer as-is.
- **API:** `POST /api/stems/split` with `stems=2` only for initial split; `POST /api/stems/expand` with `job_id` (of a 2-stem job) to get 4 stems.
- **Mixer:** Pitch (semitones), time stretch, trim, level, pan; supports stems from split and/or loaded files; export master or individual stems.

---

## Docs to keep and use

| Doc | Role |
|-----|------|
| **README.md** | Main run/setup/deploy; updated for 2-stem first, expand, load stems, API. |
| **docs/AGENT-GUIDE.MD** | Pipeline strategy (hybrid, phase inversion, CPU). |
| **docs/AGENT-models-and-implementation.md** | Model policy, where models are resolved; updated for default 2-stem and expand. |
| **docs/MODELS-INVENTORY.md** | Full model tree and copy mapping. |
| **docs/CPU-OPTIMIZATION-TIPS.md** | Env and tuning; updated (Demucs ONNX wired). |
| **docs/JOB-METRICS.md** | Job metrics and mode names. |
| **docs/SANITY-CHECKS.md** | Manual sanity checks. |
| **docs/TEST-RUN-PLAN.md** | Test run plan. |
| **docs/new_features.md** | UI/UX enhancement status; updated for current features. |
| **docs/ONNX-EFFICIENCY-INVESTIGATION.md** | ONNX inventory and pipeline notes. |
| **docs/OPENVINO-INVESTIGATION.md** | OpenVINO investigation. |
| **docs/MODELS-NEW-AND-ALTERNATIVES.md** | New/faster model options. |
| **docs/NEW-flow.md** | Research: SCNet vs Demucs on CPU (t3.large). |
| **docs/NEW-flow-implementation.md** | Implementation plan and SCNet wiring (expand 2→4). |
| **docs/AGENT-decision-knowledge-context.md**, **AGENT-Knowledge-Block.md**, **AGENT-compatible-frontend-strategy.md** | Agent/strategy context; keep for future agent layer. |

---

## Docs archived (moved to docs/archive/)

| Doc | Reason |
|-----|--------|
| **AGENT-TODO.md** | Historical task/bug list; many items addressed (pitch/time stretch, etc.). |
| **AGENT-frontend-next-steps.md** | Old frontend plan (mock UAL, timeline); does not match current app. |
| **AGENT-models-and-implementation.yaml** | Duplicate of .md with older paths (BEATS-DAW2); .md is source of truth. |

Existing archive contents (VAD-PRETRIM-TRADEOFF, DEMUCS-MODELS-INVESTIGATION, etc.) remain as-is.

---

## Updates applied

- **README.md:** Date, 2-stem first + “Keep going” for 4-stem, load stems, pitch/time stretch, `POST /api/stems/expand`, remove reference to archived MODELS-FLOW.
- **AGENT-models-and-implementation.md:** Default 2-stem, expand API and UI, Source (Split | Load stems).
- **new_features.md:** Batch queue wired, pitch + time stretch sliders, load stems, source mode.
- **CPU-OPTIMIZATION-TIPS.md:** Demucs ONNX (htdemucs_embedded, htdemucs_6s) is wired.
- **docs/archive/README.md:** List archived docs and pointer to current docs.
