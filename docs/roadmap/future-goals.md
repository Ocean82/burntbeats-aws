# Future Goals

This file tracks improvements that are valuable but too complex or wide-scoped to fold into a focused UI task. Each entry should include enough context to plan a proper investigation before implementation begins.

---

## 1. Beat-Grid Waveform Alignment

**Context:** The waveform timeline currently shows ruler-aligned time grid lines. A true beat grid would require BPM detection on each stem (or the source track) and then snapping the grid to detected beats. This would let users see drum hits, vocal phrases, and bass lines aligned to musical bars rather than arbitrary time intervals.

**Why deferred:** BPM detection is a non-trivial audio analysis step. It could be done client-side (Web Audio + autocorrelation or a library like `essentia.js`) or server-side as part of the split pipeline. The right approach needs investigation before any code is written.

**Suggested first step:** Investigate whether the existing Python/Demucs backend can emit BPM metadata alongside stem files, and whether a lightweight client-side fallback is feasible.

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

---

## 3. Master Volume as a Dedicated Channel Strip (Extended)

**Context:** The master volume slider added in the UI polish pass is functional but minimal. A full "master bus" channel strip would include: a fader with dB scale markings, a stereo VU meter pair (L/R), a peak hold indicator, a clip light, and optionally a limiter toggle. This mirrors what a real DAW master bus looks like.

**Why deferred:** The current implementation covers the core use case. The extended version requires rethinking the VUMeter component to support stereo channels and peak hold, which is a self-contained audio visualization task.

---

*Add new entries above this line. Keep descriptions concise — enough to plan, not enough to implement blindly.*
