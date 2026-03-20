gitgit # Waveform Mixer/Editor Deep Findings and Fix Plan

Updated: 2026-03-19  
Owner: Frontend audio UI  
Scope: Mixer/editor architecture, waveform rendering pipeline, playback state flow, and UX throughput

## Objective

Define a high-confidence, low-regression plan to improve mixer/editor structure, maintainability, runtime performance, and UX speed while preserving current behavior.

## Current Architecture Snapshot

- `App.tsx` orchestrates source flow, split/expand, stem buffer loading, waveform generation, playback, export, queue, shortcuts, and panel composition; mixer-focused stem UI is partially delegated to `useMixerWorkspace`.
- `MixerPanel` composes mix actions and hosts `MultiStemEditor`.
- `MultiStemEditor` hosts toolbar, `TimelineRuler`, `WaveformTimeline` (lanes + playhead), optional **Mixer console**, `StemTabs`, and `StemControls`.
- `useAudioPlayback` is the **canonical** real-time Web Audio path (mix + preview + seek + playhead subscription).
- `useTimelineViewport` centralizes zoom/scroll/visible-range math.
- `WaveformEditor` and multi-stem lanes use **shared canvas** drawing (`drawWaveformBars`).

## Deep Findings (historical context)

### 1) Oversized orchestration layer in `App.tsx`

- Partially mitigated via `useMixerWorkspace`; further slimming remains optional.

### 2) `MultiStemEditor` composition

- Improved via `WaveformLane`, `StemControls`, `TimelineRuler`, `StemTabs`, `WaveformTimeline`, `MixerConsole`.

### 3) Audio domain

- **Resolved:** Unused `AudioEngine` removed; `filterStemsForAudibleMix` in `frontend/src/utils/stemAudibility.ts` is shared by `useAudioPlayback` and `useExport` for solo/mute routing.

### 4) Waveform rendering parity

- **Resolved:** Canvas path + shared util for lanes and `WaveformEditor`.

### 5) State ownership in `App`

- Still broad; acceptable follow-up if regressions appear around buffer/preview lifecycle.

### 6) Style system

- **Improved (Phase E):** Stem-tinted surfaces use `--stem-color` / `--stem-color-soft` via `stemThemeVariables`, with classes in `frontend/src/index.css` (lanes, playhead position var, stem sliders, `WaveformEditor` shell). Some dynamic layout (e.g. trim %, canvas transform) still uses minimal inline values.

## Areas Still Worth Deeper Review (non-blocking)

1. **Interaction integrity under stress** — automated coverage optional; manual + `timelinePerformance` opt-in.
2. **`useWaveformCompute`** scheduling / cache — not exhaustively audited.
3. **Memory lifecycle** — long sessions / buffer retention.
4. **Further `App.tsx` decomposition** — optional.

## Phased Fix Strategy — Status

### Phase A — Stabilize boundaries ✅

- `useMixerWorkspace`; subcomponents including `waveform-timeline.component.tsx` (timeline shell).

### Phase B — Rendering parity + perf ✅

- Canvas `WaveformEditor`, `waveformCanvas.ts`, `timelinePerformance.ts` (+ tests).

### Phase C — Mixer UX ✅

- Per-lane mute/solo/gain; advanced controls in `StemControls`; **Console** toggle + `mixer-console.component.tsx` (JSON snapshot of stem state + playhead).

### Phase D — Audio convergence ✅

- `AudioEngine` deleted; shared `filterStemsForAudibleMix`; playback vs export routing aligned; playhead/seek ownership documented in `useAudioPlayback`.

### Phase E — Visual cleanup ✅ (primary surfaces)

- Stem-scoped CSS variables + shared classes; residual inline where geometry is data-driven.

## Sequencing and Risk Controls

- Prefer small PRs and full frontend `npm run build` + `npm run test:run` after substantive UI/audio changes.

## Immediate Next Step

Optional: extend component tests to `WaveformTimeline` seek/trim; audit `useWaveformCompute` if waveform staleness is reported.
