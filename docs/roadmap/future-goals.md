# Future Goals

This file tracks improvements that are valuable but too complex or wide-scoped to fold into a focused UI task. Each entry should include enough context to plan a proper investigation before implementation begins.

## Status Legend

- ✅ Mostly completed: implemented and usable; only validation/polish remains
- 🟡 In progress: meaningful implementation landed; follow-up work still required
- ⚪ Planned: not started beyond discovery/spec

## Target Windows (planning guide)

- **Beat-Grid validation + fallback decision:** 1-2 sessions
- **App.tsx decomposition completion:** 2-4 sessions
- **Master strip optional limiter + polish:** 1-2 sessions

## Suggested Weekly Plan (starting 2026-05-04)

### Week 1 (May 4-10): Beat-Grid Validation
- Run targeted QA on BPM/beat-grid across varied songs (steady tempo, tempo drift, sparse percussion, low-SNR audio).
- Define confidence thresholds for showing/hiding beat-grid overlays.
- Decide and document whether a client-side fallback is required.
- Exit criteria: beat-grid behavior rules documented; no blocker-level timeline regressions.

### Week 2 (May 11-17): App.tsx Decomposition (Phase 2)
- Continue extracting render/orchestration seams from `App.tsx` into focused `app/*` components.
- Preserve existing prop and hook contracts; avoid behavior changes.
- Run lint/tests after each extraction step.
- Exit criteria: meaningful line-count reduction and cleaner boundaries without regressions.

### Week 3 (May 18-24): Master Strip Finishing Pass
- Implement optional limiter toggle UX (if kept in scope).
- Perform visual/accessibility polish on master strip controls and labels.
- Validate meter/fader behavior on desktop and mobile breakpoints.
- Exit criteria: mixer master strip feels production-ready and test-stable.

---

## 1. Beat-Grid Waveform Alignment

**Context:** The waveform timeline currently shows ruler-aligned time grid lines. A true beat grid would require BPM detection on each stem (or the source track) and then snapping the grid to detected beats. This would let users see drum hits, vocal phrases, and bass lines aligned to musical bars rather than arbitrary time intervals.

**Why deferred:** BPM detection is a non-trivial audio analysis step. It could be done client-side (Web Audio + autocorrelation or a library like `essentia.js`) or server-side as part of the split pipeline. The right approach needs investigation before any code is written.

**Suggested first step:** Investigate whether the existing Python/Demucs backend can emit BPM metadata alongside stem files, and whether a lightweight client-side fallback is feasible.

**Status (2026-05):** ✅ Mostly completed
- Backend BPM analysis exists (`stem_service/bpm_analysis.py`) and is emitted in split progress/status payloads (`beat_grid` metadata).
- Frontend consumes and renders beat-grid metadata in the timeline (`frontend/src/api.ts`, `frontend/src/hooks/useStemSplitting.ts`, `frontend/src/components/MultiStemEditor.tsx`, `frontend/src/utils/beatGrid.ts`).
- Remaining: validate beat-detection quality on edge cases (tempo drift, sparse percussion, low-confidence tracks) and decide whether a client-side fallback is still needed.

---

## 2. App.tsx Decomposition

**Context:** `App.tsx` is approximately 1100 lines and serves as both the hook orchestrator and the full render tree. The JSX render section alone is ~600 lines. This makes it harder to isolate bugs, reason about layout changes, and onboard new contributors.

**Why deferred:** Decomposition carries refactor risk — prop threading, import updates, and potential for subtle behavioral regressions. It should be its own focused task with a clear component boundary plan, not folded into a UI polish pass.

**Suggested approach:**
- Extract the sticky header into `frontend/src/app/editor-header.component.tsx`
- Extract the mixer workspace section (onboarding checklist, ghost UI, MixerPanel) into `frontend/src/app/mixer-workspace.component.tsx`
- Keep `App.tsx` as a thin hook orchestrator that passes data down
- Run full diagnostics and existing tests after each extraction step
- Do not change any prop shapes or hook interfaces during this refactor

**Files that will be affected:** `App.tsx`, new `editor-header.component.tsx`, new `mixer-workspace.component.tsx`, potentially `app-shell.component.tsx`

**Status (2026-05):** 🟡 In progress
- Suggested extractions landed:
  - `frontend/src/app/editor-header.component.tsx`
  - `frontend/src/app/mixer-workspace.component.tsx`
- `App.tsx` now delegates major UI sections to those components.
- Remaining: continue reducing orchestration/render weight in `App.tsx` until it is a truly thin coordinator (currently still large), while preserving existing hook and prop contracts.

---

## 3. Master Volume as a Dedicated Channel Strip (Extended)

**Context:** The master volume slider added in the UI polish pass is functional but minimal. A full "master bus" channel strip would include: a fader with dB scale markings, a stereo VU meter pair (L/R), a peak hold indicator, a clip light, and optionally a limiter toggle. This mirrors what a real DAW master bus looks like.

**Why deferred:** The current implementation covers the core use case. The extended version requires rethinking the VUMeter component to support stereo channels and peak hold, which is a self-contained audio visualization task.

**Status (2026-05):** ✅ Mostly completed
- Dedicated master strip UI exists in mixer panel with:
  - vertical master fader + dB readout
  - stereo VU meter (L/R)
  - peak-hold/decay behavior
  - clip indicator
- Remaining: optional limiter toggle UX (if desired) and any final visual polish/accessibility tuning for the strip.

---

*Add new entries above this line. Keep descriptions concise — enough to plan, not enough to implement blindly.*
