# Implementation Plan: Pitch-Tempo Plugin Integration

## Overview

Integrate the `PitchTempoPlugin` (phase vocoder AudioWorklet) into the existing `useAudioPlayback` orchestrator to provide independent pitch shifting and time stretching for live stem preview. The implementation proceeds from foundation (package install, utility functions) through core audio graph changes, hot-swap optimization, UI updates, and finally testing.

## Tasks

- [x] 1. Install pitch-plugin package and add fast-check test dependency
  - Add `"pitch-plugin": "file:./src/components/multi-stem-editor/pitch-tempo-plugin"` to `frontend/package.json` dependencies
  - Add `@fast-check/vitest` to `frontend/package.json` devDependencies
  - Run `npm install` in the frontend directory
  - Verify `import { PitchTempoPlugin, PARAM_META } from 'pitch-plugin'` resolves without errors
  - _Requirements: 10.1, 1.4_

- [x] 2. Implement utility functions and update duration calculations
  - [x] 2.1 Create `timeStretchToTempoRatio` utility function
    - Add `timeStretchToTempoRatio(timeStretch: number): number` to `frontend/src/utils/audio.ts`
    - Returns `1.0 / timeStretch` for positive values, `1.0` for zero/negative
    - Export the function for use in `useAudioPlayback` and tests
    - _Requirements: 3.1, 5.2_

  - [x] 2.2 Update `getStemTrimWallDurationSeconds` with `usePlugin` parameter
    - Add optional `usePlugin: boolean = false` parameter
    - When `usePlugin` is true, return `len * (st.timeStretch ?? 1.0)` instead of `len / getStemEffectiveRate(st)`
    - Ensure existing callers (without the parameter) retain legacy behavior
    - _Requirements: 7.1, 7.2_

  - [x] 2.3 Update `trimStartOffsetAtElapsedWall` with `usePlugin` parameter
    - Add optional `usePlugin: boolean = false` parameter
    - When `usePlugin` is true, calculate `delta = Math.min(trimLen, elapsedWallSeconds / (st.timeStretch ?? 1.0))`
    - Ensure existing callers retain legacy behavior
    - _Requirements: 7.3_

  - [ ]* 2.4 Write unit tests for `timeStretchToTempoRatio`
    - Test normal values (0.85, 1.0, 1.15), edge values, zero/negative input
    - _Requirements: 3.1, 5.2_

  - [ ]* 2.5 Write unit tests for updated duration and seek functions
    - Test `getStemTrimWallDurationSeconds` with `usePlugin=true` for various trim/stretch combos
    - Test `trimStartOffsetAtElapsedWall` with `usePlugin=true` for seek to 0%, 50%, 100%
    - Verify legacy behavior unchanged when `usePlugin=false`
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement plugin pool and lifecycle management in useAudioPlayback
  - [x] 4.1 Add plugin pool refs and import PitchTempoPlugin
    - Add `import { PitchTempoPlugin } from 'pitch-plugin'` to `useAudioPlayback.ts`
    - Add `pluginPoolRef = useRef<Map<string, PitchTempoPlugin>>(new Map())`
    - Add `pluginAvailableRef = useRef<boolean | null>(null)` (null = untested)
    - _Requirements: 10.1, 10.4_

  - [x] 4.2 Implement `getOrCreatePlugin` function
    - If `pluginAvailableRef.current === false`, return null immediately (fallback mode)
    - If pool has existing plugin for stemId, call `plugin.reset()` and return it
    - Otherwise create `new PitchTempoPlugin({ audioContext: ctx })`, await `plugin.ready()`, store in pool
    - On failure: set `pluginAvailableRef = false`, log warning, return null
    - _Requirements: 1.5, 10.3, 10.4_

  - [x] 4.3 Implement `destroyAllPlugins` function
    - Iterate `pluginPoolRef.current`, call `plugin.destroy()` on each
    - Clear the map
    - _Requirements: 10.2_

  - [x] 4.4 Add cleanup call in unmount effect
    - Call `destroyAllPlugins()` in the existing cleanup `useEffect` return function
    - _Requirements: 10.2_

- [x] 5. Modify audio graph wiring for plugin insertion
  - [x] 5.1 Extend `MixStemRuntime` type with plugin field
    - Add `plugin: PitchTempoPlugin | null` to the `MixStemRuntime` type
    - _Requirements: 1.1_

  - [x] 5.2 Modify `buildStemSource` to accept and wire plugin
    - Add `plugin: PitchTempoPlugin | null` parameter
    - When plugin is non-null: set `source.playbackRate.value = 1.0`, connect `source → plugin.inputNode → plugin.outputNode → dspInput`, call `plugin.setPitchSemitones()` and `plugin.setTempoRatio()`
    - When plugin is null: retain legacy behavior (`source.playbackRate.value = getStemEffectiveRate(st)`, `source → dspInput`)
    - _Requirements: 1.1, 1.2, 3.5, 2.1, 3.1_

  - [x] 5.3 Update `stopMixStemRuntime` to handle plugin disconnection
    - After stopping and disconnecting source, if `r.plugin` exists, disconnect `plugin.outputNode` from DSP chain
    - Do NOT destroy the plugin (it's reused from the pool)
    - _Requirements: 1.3_

  - [x] 5.4 Update `rebuildMixAtPct` to create plugins and pass to buildStemSource
    - For each stem, call `await getOrCreatePlugin(context, stem.id)` before building the source
    - Pass the plugin to `buildStemSource`
    - Store plugin reference in the `MixStemRuntime` object
    - Use `usePlugin: true` flag for `trimStartOffsetAtElapsedWall` and duration calculations when plugin is available
    - Update `mixDurationRef` using `maxTrimWallDurationSeconds` with plugin-aware calculation
    - _Requirements: 1.1, 1.4, 1.5, 7.1, 7.2_

  - [x] 5.5 Update `handlePreviewStem` and `seekToPreview` to use plugin
    - Apply the same plugin wiring pattern for single-stem preview playback
    - Store plugin in `currentPreviewRuntimeRef`
    - _Requirements: 1.1, 1.2_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement hot-swap optimization for pitch/tempo changes
  - [x] 7.1 Create `stemPitchTempoSignature` and `stemMuteSoloSignature` helper functions
    - Add to `frontend/src/utils/stemPlaybackUtils.ts`
    - `stemPitchTempoSignature`: extracts only pitch + timeStretch per stem
    - `stemMuteSoloSignature`: extracts only muted + soloed per stem
    - _Requirements: 5.4, 6.1_

  - [x] 7.2 Split hot-swap routing detection logic
    - In the `useEffect` that watches `stemStatesProp` for hot-swap, compare `stemMuteSoloSignature` and `stemPitchTempoSignature` separately
    - If only pitch/tempo changed AND `pluginAvailableRef.current === true`: update plugins in-place via `setPitchSemitones()` / `setTempoRatio()` without calling `rebuildMixAtPct`
    - If mute/solo changed: trigger full rebuild (existing behavior)
    - Recalculate `mixDurationRef` after tempo changes (tempo affects wall-clock duration)
    - _Requirements: 6.1, 6.2, 2.4, 3.4_

  - [x] 7.3 Update preview hot-swap for in-place plugin updates
    - In the preview hot-swap `useEffect`, if only pitch/tempo changed and plugin is active, update plugin directly instead of calling `seekToPreview`
    - _Requirements: 6.1, 2.4, 3.4_

  - [ ]* 7.4 Write unit tests for routing signature split
    - Verify `stemPitchTempoSignature` changes when pitch/tempo changes
    - Verify `stemMuteSoloSignature` does NOT change when only pitch/tempo changes
    - Verify `stemRoutingSignature` still changes for any of mute/solo/pitch/tempo (regression)
    - _Requirements: 5.4, 6.1_

- [x] 8. Update UI slider ranges
  - [x] 8.1 Update pitch slider in MultiStemEditor
    - Change `min` from `-12` to `-3`, `max` from `12` to `3`, `step` from `1` to `0.1`
    - Update display format to show one decimal place (e.g., `+1.5 st`)
    - _Requirements: 4.1, 4.4_

  - [x] 8.2 Update tempo slider in MultiStemEditor
    - Change `min` to `0.85`, `max` to `1.15`, `step` to `0.01`
    - Update display format to show percentage (e.g., `-15%` to `+15%`)
    - _Requirements: 4.2, 4.4_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Write property-based tests
  - [x]* 10.1 Write property test for timeStretch-to-tempoRatio inverse conversion
    - **Property 1: timeStretch to tempoRatio Inverse Conversion**
    - Generate `timeStretch` in (0.1, 5.0), verify `timeStretchToTempoRatio(ts) ≈ 1.0 / ts`
    - Generate `timeStretch` in [0.85, 1.15], verify result falls in plugin range after clamping
    - **Validates: Requirements 3.1, 5.2**

  - [x]* 10.2 Write property test for pitch value clamping
    - **Property 2: Pitch Value Clamping**
    - Generate arbitrary pitch values in [-100, 100], verify plugin clamps to [-3, 3]
    - Use `PitchTempoPlugin` mock or direct PARAM_META range check
    - **Validates: Requirements 2.2**

  - [x]* 10.3 Write property test for tempo ratio clamping
    - **Property 3: Tempo Ratio Clamping**
    - Generate arbitrary tempo ratios in [0.1, 5.0], verify plugin clamps to [0.85, 1.15]
    - **Validates: Requirements 3.2**

  - [x]* 10.4 Write property test for legacy effective rate formula preservation
    - **Property 4: Legacy Effective Rate Formula Preservation**
    - Generate `pitchSemitones` in [-12, 12] and `timeStretch` in (0.1, 2.0)
    - Verify `getStemEffectiveRate(state) ≈ 2^(pitchSemitones/12) / timeStretch`
    - **Validates: Requirements 5.3, 9.1**

  - [x]* 10.5 Write property test for plugin-mode wall-clock duration
    - **Property 5: Plugin-Mode Wall-Clock Duration**
    - Generate buffer duration, trim percentages, and `timeStretch` in [0.85, 1.15]
    - Verify `getStemTrimWallDurationSeconds(buffer, state, true) ≈ (trimEnd - trimStart) * timeStretch`
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 10.6 Write property test for plugin-mode seek offset consistency
    - **Property 6: Plugin-Mode Seek Offset Consistency**
    - Generate buffer, trim, timeStretch, and elapsedWall in [0, wallDuration]
    - Verify `startOffset ≈ trimStart + (elapsedWall / timeStretch)` capped at trimEnd
    - **Validates: Requirements 7.3**

  - [x]* 10.7 Write property test for duration-seek round trip
    - **Property 7: Duration-Seek Round Trip**
    - Generate valid stem config, compute wallDuration, seek to wallDuration
    - Verify `startOffset === trimEnd` (playhead reaches exactly 100%)
    - **Validates: Requirements 7.1, 7.3**

  - [x]* 10.8 Write property test for routing signature sensitivity
    - **Property 8: Routing Signature Sensitivity**
    - Generate two StemEditorState objects differing only in pitchSemitones or timeStretch
    - Verify `stemRoutingSignature()` produces different strings
    - **Validates: Requirements 5.4, 6.1**

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The design uses TypeScript throughout — all implementation is in TypeScript
- Property tests validate the 8 correctness properties defined in the design document
- The plugin's `PitchTempoPlugin` class is used directly (not the widget or hook)
- Fallback to legacy `playbackRate` is automatic if plugin init fails — no user-facing error
- The export pipeline is intentionally unchanged (continues using `getStemEffectiveRate`)
