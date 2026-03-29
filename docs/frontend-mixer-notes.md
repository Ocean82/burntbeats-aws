# Frontend mixer and waveform (canonical notes)

Updated: 2026-03-22  
Scope: Mixer/editor architecture, performance follow-ups, and UI backlog pointers.

For product-level UI ideas, see [new_features.md](new_features.md).

---

## Architecture snapshot

- `main.tsx` → `AppShell` (`ErrorBoundary`) → `App`. Sections: split/source, mixer, status.
- `App.tsx` orchestrates upload, split/expand, stem buffers, playback, export, queue, shortcuts.
- `MixerPanel` hosts `MultiStemEditor`.
- `MultiStemEditor`: toolbar, `TimelineRuler`, `WaveformTimeline` (lanes + playhead), optional **Mixer console**, `StemTabs`, `StemControls`.
- `useAudioPlayback` — canonical Web Audio path (mix + preview + seek); playhead updates.
- `useTimelineViewport` — zoom/scroll / visible-range math.
- `WaveformEditor` and multi-stem lanes use shared canvas drawing (`drawWaveformBars` / shared util).

Audio/export: `filterStemsForAudibleMix` in `frontend/src/utils/stemAudibility.ts` aligns playback with export.

---

## Completed phases (historical)

Phases A–E (mixer decomposition, canvas waveforms, console toggle, shared audibility, stem CSS variables) are largely done; see prior standalone docs merged here 2026-03.

---

## Remaining opportunities (optional)

1. **Playhead vs React** — `useAudioPlayback` still drives playhead through state; ref-first + narrow subscriptions would reduce rerenders during playback.
2. **Waveform cost** — Long tracks + zoom still stress layout; further canvas-only paths or downsampling tuning if needed.
3. **Viewport helpers** — Consolidate any remaining duplicated timeline math (prefer `useTimelineViewport`).
4. **Tests** — Extend coverage for `WaveformTimeline` seek/trim if regressions appear.
5. **App.tsx size** — Further decomposition optional.

---

## Prioritized plan (from earlier adjustment doc)

When revisiting perf, prefer this order:

1. Isolate live playhead updates (ref + subscribers) in `useAudioPlayback.ts`.
2. Ensure timeline math goes through shared viewport hooks.
3. Ship risky UI behind flags; run `npm run build` and tests after audio changes.

---

## Acceptance targets (when optimizing)

- Smooth playback on ~5 min tracks with all stems visible on typical laptops.
- No broad `App` rerender spikes from playhead alone.
- Trim/solo/mute/export behavior unchanged.
