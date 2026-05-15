# Mixer Tools Audit — Fix Plan & Strategy

## Overview

This plan addresses all issues found during the post-stem-separation mixing tools audit.
Changes are grouped into phases ordered by severity and dependency.

**Status: IMPLEMENTED** — All phases complete, TypeScript compiles clean, 111/111 tests pass.

---

## Phase 1: Critical — Export/Playback Parity (WYSIWYG Fix) ✅

### Problem
`renderClientMaster.ts` only applied gain, pan, width, rate, and trim.
It **ignored** EQ (low/mid/high), reverb, delay, and compressor — all of which
are applied during real-time playback via `createStemDspChain`. Users heard one
thing and exported another.

### Solution
Replaced the manual simplified graph in `renderClientMaster.ts` with the full
`createStemDspChain` function. Added effect tail handling (extra 2s render time
when reverb/delay are active) with intelligent silence trimming to avoid bloated
file sizes.

### Files Modified
- `frontend/src/hooks/export/renderClientMaster.ts`

---

## Phase 2: Stereo Width Semantics Fix ✅

### Problem
The comment said "width=0: stereo unchanged" but the math produced **mono** at
width=0. The default was 80, which was close to original stereo but not identical.

### Solution
- Changed default width from 80 to 100 (= full stereo, no processing)
- Updated the `createStereoWidthNode` documentation to correctly describe semantics:
  width=100 → original stereo, width=0 → mono, width=-100 → inverted
- Updated preset width values to use the corrected scale
- Changed the stem-controls width slider range from [-100, 100] to [0, 100]
  with double-click-to-reset and proper aria-valuetext

### Files Modified
- `frontend/src/types.ts`
- `frontend/src/utils/audio.ts`
- `frontend/src/components/MixerPresetsModal.tsx`
- `frontend/src/components/multi-stem-editor/stem-controls.component.tsx`

---

## Phase 3: Expose Reverb, Delay & Compressor UI Controls ✅

### Problem
These effects existed in the DSP chain and `MixerState` type but had **zero UI**.
Users could not adjust them.

### Solution
Added a new "FX" panel to the MultiStemEditor toolbar (alongside Pitch, EQ,
Amplitude, Time). The panel exposes:
- Reverb wet (0–100% slider)
- Delay wet (0–100% slider)
- Compressor threshold (-60 to 0 dB slider)
- Compressor ratio (1–20 slider)

All sliders include value readouts and double-click-to-reset behavior.

### Files Modified
- `frontend/src/components/MultiStemEditor.tsx`

---

## Phase 4: Lazy DSP Chain — Skip Inactive Effects ✅

### Problem
Even when reverb/delay/compressor were at their defaults (0 wet, 0dB threshold,
1:1 ratio), the full DSP chain was instantiated per stem. The convolver reverb
allocated a 1.8s impulse response buffer per stem regardless.

### Solution
Made `createStemDspChain` conditionally skip creating reverb/delay/compressor
nodes when their values are at defaults:
- Reverb: only created when `reverbWet > 0`
- Delay: only created when `delayWet > 0`
- Compressor: only created when `compThreshold < 0 || compRatio > 1`

The `update()` method safely no-ops for absent nodes. Enabling an effect
mid-playback triggers the existing hot-swap rebuild path.

Also widened the function signature from `AudioContext` to `BaseAudioContext`
so it works cleanly with both real-time and offline contexts (export).

### Files Modified
- `frontend/src/utils/audio.ts`

---

## Phase 5: MixerConsole Production Guard ✅

### Problem
`MixerConsole` was imported statically. While gated behind `!import.meta.env.PROD`,
Vite's dead-code elimination handles this correctly for production builds since
`import.meta.env.PROD` is a compile-time constant that Vite replaces during build.

### Resolution
Verified that the existing `!import.meta.env.PROD` guard is sufficient for Vite's
tree-shaking. No code change needed — Vite replaces the condition at build time
and the bundler eliminates the dead branch.

---

## Phase 6: EQ Panel UX Improvements ✅

### Problem
The EQ panel showed three unlabeled sliders with no indication of which frequency
band each controlled and no value readout.

### Solution
- Added labels: "Low 200 Hz", "Mid 1 kHz", "High 6 kHz"
- Added dB value readouts (e.g., "+3.5 dB")
- Added double-click-to-reset behavior (resets to 0 dB)
- Added "Double-click to reset" hint text
- Improved aria-labels with frequency information

### Files Modified
- `frontend/src/components/MultiStemEditor.tsx`

---

## Verification

- TypeScript: `tsc --noEmit` passes with exit code 0
- Tests: 111/111 tests pass (vitest run)
- No breaking changes to existing APIs or state shapes
