# Waveform Mixer and Editor Adjustment Plan

Updated: 2026-03-19
Owner: Frontend audio UI
Scope: `frontend/src/App.tsx`, `frontend/src/hooks/useAudioPlayback.ts`, `frontend/src/components/MultiStemEditor.tsx`, `frontend/src/components/WaveformEditor.tsx`, `frontend/src/components/mixer-panel.component.tsx`, `frontend/src/index.css`

## Goal

Improve waveform and mixer reliability, runtime performance, and editing ergonomics without regressing current stem playback features (trim, seek, solo/mute, pan, gain, pitch, stretch).

## Current Findings (Validated)

1. **High-frequency playhead updates still trigger broad React updates**
   - `useAudioPlayback.ts` updates `playheadPosition` via `requestAnimationFrame`.
   - `MultiStemEditor` already optimizes lane rendering with a single global playhead overlay, but the state still flows through parent-level React state.
   - Impact: extra render pressure while mix/preview is running.

2. **Waveform rendering remains DOM-heavy**
   - `MultiStemEditor` and `WaveformEditor` draw bars with many `<span>` nodes.
   - Current downsampling and memoization help, but zoom and long tracks still increase paint/layout cost.
   - Impact: scroll/zoom jank on lower-end devices.

3. **Viewport math is duplicated**
   - Zoom/scroll clamping, visible ranges, and timeline math are repeated across editors.
   - Impact: drift risk between editors and harder maintenance.

4. **Track mixing workflow is still click-heavy**
   - Major controls are centered in active-stem panel.
   - Impact: balancing multiple stems requires repetitive switching.

5. **Trim interaction can be more forgiving**
   - Hit detection exists, but handles remain visually narrow and feedback is limited.
   - Impact: precision friction during fast editing.

## Prioritized Implementation Plan

### Phase 1 (P0) - Performance and Architecture

1. **Isolate live playhead updates from parent render path**
   - Add a lightweight playhead subscription model in `useAudioPlayback.ts`:
     - Keep authoritative playhead in a ref.
     - Notify only interested UI nodes (playhead indicator and time readout).
   - Keep existing public hook API stable where possible.
   - Update `App.tsx` wiring to reduce top-level churn during playback.

2. **Introduce canvas waveform rendering path**
   - Create shared canvas renderer utility for bar rendering and trim overlays.
   - Enable canvas path in `MultiStemEditor` first, then `WaveformEditor`.
   - Keep DOM fallback behind a feature flag until parity is confirmed.

3. **Extract timeline viewport logic**
   - Add `useTimelineViewport` hook for:
     - zoom bounds
     - scroll clamp
     - visible start/end/range calculations
     - conversion helpers between percent and visible coords
   - Reuse in both editors.

### Phase 2 (P1) - Editing UX and Layout

4. **Add compact per-lane track header controls**
   - In each `WaveformLane`: small gain, mute, solo controls.
   - Preserve detailed controls in active-stem panel for advanced edits.

5. **Add mixer console mode**
   - Build side-by-side fader layout in `mixer-panel.component.tsx`.
   - Toggle between timeline view and console view.

6. **Upgrade trim affordance**
   - Increase visual handle width while preserving precise trim values.
   - Add hover/active feedback and optional modifier key for fine movement.

### Phase 3 (P2) - Visual System Cleanup

7. **Move repeated glow/gradient values to CSS variables**
   - Define stem-scoped variables at container level.
   - Consume through utility classes + minimal inline style for dynamic values.

## File-by-File Change Checklist

- `frontend/src/hooks/useAudioPlayback.ts`
  - Add playhead subscriber mechanism and ref-first updates.
  - Keep seek/play/stop semantics unchanged.
- `frontend/src/App.tsx`
  - Use isolated playhead consumer component to avoid broad updates.
- `frontend/src/components/MultiStemEditor.tsx`
  - Switch lane rendering to canvas path.
  - Integrate shared viewport hook.
  - Add compact lane controls.
- `frontend/src/components/WaveformEditor.tsx`
  - Reuse shared viewport hook.
  - Add canvas rendering parity.
- `frontend/src/components/mixer-panel.component.tsx`
  - Add timeline/console mode switch and console layout.
- `frontend/src/index.css`
  - Add waveform and stem CSS variable tokens.

## Acceptance Criteria

1. Playback keeps 60fps target on a 5-minute track with all stems visible on typical laptop hardware.
2. Playhead movement no longer causes broad app-level rerender spikes.
3. Multi-stem and single-stem editors share one viewport logic source.
4. Users can adjust gain/mute/solo for multiple stems without tab switching.
5. Trim handles are easier to acquire and provide clear hover/drag feedback.
6. No regressions in existing stem operations and keyboard/mouse behavior.

## Risk Controls

- Ship behind feature flags for canvas and mixer console.
- Keep DOM waveform rendering fallback until test parity is complete.
- Add targeted component tests for viewport math and control interactions.
- Profile before/after with browser performance traces.

## Immediate Next Step

Start with Phase 1 in this order:
1) playhead isolation in `useAudioPlayback.ts`
2) shared viewport hook extraction
3) canvas renderer integration in `MultiStemEditor.tsx`