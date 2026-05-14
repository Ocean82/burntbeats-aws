# Requirements Document

## Introduction

This feature integrates the existing pitch-tempo plugin (a phase vocoder AudioWorklet) into the stem-splitting web app's live preview pipeline. The current system uses `AudioBufferSourceNode.playbackRate` which couples pitch and tempo — changing pitch inherently changes speed. The plugin provides true independent pitch shifting (±3 semitones) and tempo adjustment (0.85–1.15x) via a phase vocoder, enabling users to preview stems with pitch and tempo modified independently without audible coupling artifacts.

The integration uses the plugin's `PitchTempoPlugin` class (low-level DSP) wired per-stem into the existing mixer DSP chain (EQ, reverb, delay, compressor, pan, stereo width). This preserves all existing mixer features while upgrading pitch/tempo to true independent control. The plugin's own transport/playback is not used — the existing `useAudioPlayback` orchestrator retains control of playback, seek, and playhead tracking.

## Glossary

- **Plugin**: The pitch-tempo phase vocoder AudioWorklet located at `frontend/src/components/multi-stem-editor/pitch-tempo-plugin/`
- **PitchTempoPlugin**: The low-level DSP class from the plugin that wraps the AudioWorklet node, exposing `inputNode`, `outputNode`, `setPitchSemitones()`, `setTempoRatio()`, `bypass()`, and `reset()` methods
- **DSP_Chain**: The existing per-stem audio processing chain (`createStemDspChain`) consisting of gain → EQ → compressor → pan → stereo width → reverb/delay sends → output
- **Playback_Orchestrator**: The `useAudioPlayback` hook that manages mix playback, stem preview, seek, hot-swap, and playhead tracking
- **AudioContext_Manager**: The `useAudioContext` hook that owns the singleton AudioContext and master bus (gain → limiter → analyser → destination)
- **StemEditorState**: The per-stem state object containing `pitchSemitones`, `timeStretch`, `trim`, `mixer`, `muted`, and `soloed` fields
- **Phase_Vocoder**: The AudioWorklet processor that performs time-frequency analysis (STFT) to shift pitch and stretch time independently
- **Hot_Swap**: The mechanism that tears down and rebuilds running audio sources when pitch/tempo/trim parameters change during playback
- **Master_Bus**: The shared output chain (master gain → optional limiter → analyser → destination) that all stem DSP chains connect to
- **Effective_Rate**: The legacy formula `2^(pitch/12) / timeStretch` used by `AudioBufferSourceNode.playbackRate` — replaced by the plugin for live preview but retained for export

## Requirements

### Requirement 1: Per-Stem Plugin Node Insertion

**User Story:** As a music producer, I want each stem's audio to pass through the phase vocoder plugin before reaching the mixer DSP chain, so that pitch and tempo adjustments are applied independently without coupling artifacts.

#### Acceptance Criteria

1. WHEN a mix or stem preview begins playback, THE Playback_Orchestrator SHALL create a PitchTempoPlugin instance for each audible stem and insert it between the AudioBufferSourceNode and the DSP_Chain input
2. THE Playback_Orchestrator SHALL wire the audio graph as: `source → PitchTempoPlugin.inputNode → PitchTempoPlugin.outputNode → DSP_Chain.input → DSP_Chain.output → Master_Bus`
3. WHEN playback stops, THE Playback_Orchestrator SHALL call `destroy()` on each PitchTempoPlugin instance and disconnect all associated nodes
4. THE Playback_Orchestrator SHALL share the existing AudioContext from the AudioContext_Manager with all PitchTempoPlugin instances to avoid creating additional contexts
5. WHEN the PitchTempoPlugin worklet is loading, THE Playback_Orchestrator SHALL await `plugin.ready()` before starting the AudioBufferSourceNode to prevent audio glitches

### Requirement 2: Independent Pitch Control

**User Story:** As a music producer, I want to shift a stem's pitch without affecting its playback speed, so that I can match keys between stems or experiment with tonal changes.

#### Acceptance Criteria

1. WHEN `StemEditorState.pitchSemitones` changes for a stem, THE Playback_Orchestrator SHALL call `plugin.setPitchSemitones(value)` on that stem's PitchTempoPlugin instance
2. THE PitchTempoPlugin SHALL clamp pitch values to the range -3 to +3 semitones with 0.1 semitone resolution
3. WHILE a stem is playing with a non-zero pitch shift, THE PitchTempoPlugin SHALL maintain the original playback duration (tempo remains unaffected)
4. WHEN pitch changes during active playback, THE Playback_Orchestrator SHALL apply the change in real-time without restarting the source node

### Requirement 3: Independent Tempo Control

**User Story:** As a music producer, I want to adjust a stem's playback speed without affecting its pitch, so that I can align timing between stems or slow down passages for analysis.

#### Acceptance Criteria

1. WHEN `StemEditorState.timeStretch` changes for a stem, THE Playback_Orchestrator SHALL convert the value to a tempo ratio and call `plugin.setTempoRatio(ratio)` on that stem's PitchTempoPlugin instance
2. THE PitchTempoPlugin SHALL clamp tempo ratio values to the range 0.85 to 1.15
3. WHILE a stem is playing with a non-unity tempo ratio, THE PitchTempoPlugin SHALL maintain the original pitch (pitch remains unaffected)
4. WHEN tempo changes during active playback, THE Playback_Orchestrator SHALL apply the change in real-time without restarting the source node
5. THE Playback_Orchestrator SHALL set `AudioBufferSourceNode.playbackRate` to 1.0 (unity) for all stems when the plugin is active, since tempo control is handled by the Phase_Vocoder

### Requirement 4: UI Slider Range Update

**User Story:** As a music producer, I want the pitch and tempo sliders to reflect the plugin's quality-optimized parameter ranges, so that I only use settings that produce clean audio output.

#### Acceptance Criteria

1. THE pitch slider component SHALL use a range of -3 to +3 semitones with 0.1 step increments
2. THE tempo slider component SHALL use a range of 0.85 to 1.15 (displayed as -15% to +15%) with 0.01 step increments
3. WHEN the user drags a pitch or tempo slider, THE slider component SHALL update `StemEditorState` which triggers the hot-swap mechanism to apply changes to the running plugin
4. THE slider component SHALL display the current value with appropriate units (semitones for pitch, percentage for tempo)

### Requirement 5: State Management Bridge

**User Story:** As a developer, I want the existing StemEditorState to drive the plugin parameters, so that the integration requires minimal changes to the app's state architecture.

#### Acceptance Criteria

1. THE Playback_Orchestrator SHALL read `StemEditorState.pitchSemitones` and pass it directly to `PitchTempoPlugin.setPitchSemitones()`
2. THE Playback_Orchestrator SHALL read `StemEditorState.timeStretch` and convert it to a tempo ratio (where `timeStretch = 1.0` maps to `tempoRatio = 1.0`, `timeStretch = 0.85` maps to `tempoRatio = 1/0.85 ≈ 1.176`, and `timeStretch = 1.15` maps to `tempoRatio = 1/1.15 ≈ 0.87`) for the plugin
3. THE `getStemEffectiveRate()` function SHALL continue to return the legacy coupled rate for use by the export pipeline (server-side FFmpeg processing)
4. THE `stemRoutingSignature()` function SHALL continue to include pitch and timeStretch values so that hot-swap detection triggers correctly when these parameters change

### Requirement 6: Hot-Swap Parameter Updates

**User Story:** As a music producer, I want pitch and tempo changes to take effect immediately during playback without audible gaps, so that I can experiment in real-time.

#### Acceptance Criteria

1. WHEN `StemEditorState.pitchSemitones` or `StemEditorState.timeStretch` changes during playback, THE Playback_Orchestrator SHALL update the running PitchTempoPlugin parameters without stopping and restarting the audio source
2. IF the plugin parameter update fails or the plugin is not yet ready, THEN THE Playback_Orchestrator SHALL fall back to the existing hot-swap mechanism (rebuild sources at current playhead position)
3. THE Playback_Orchestrator SHALL call `plugin.reset()` before restarting playback after a stop to prevent phase accumulator drift

### Requirement 7: Playback Duration Calculation

**User Story:** As a music producer, I want the playhead and timeline to accurately reflect the actual playback duration when tempo is adjusted, so that I can see where I am in the track.

#### Acceptance Criteria

1. WHEN tempo ratio is not 1.0, THE `getStemTrimWallDurationSeconds()` function SHALL calculate wall-clock duration as `trimmedLength / tempoRatio` instead of `trimmedLength / effectiveRate`
2. THE `maxTrimWallDurationSeconds()` function SHALL use the plugin-aware duration calculation to determine the master timeline length
3. WHEN seeking during playback with a non-unity tempo, THE Playback_Orchestrator SHALL calculate the correct buffer offset using the tempo ratio

### Requirement 8: Bypass Mode

**User Story:** As a music producer, I want to quickly A/B compare the processed and unprocessed audio, so that I can evaluate whether my pitch/tempo adjustments improve the mix.

#### Acceptance Criteria

1. WHEN bypass is activated for a stem, THE Playback_Orchestrator SHALL call `plugin.bypass(true)` which passes audio through the plugin node unprocessed
2. WHEN bypass is deactivated, THE Playback_Orchestrator SHALL call `plugin.bypass(false)` to re-engage the phase vocoder processing
3. THE bypass toggle SHALL take effect immediately without restarting playback

### Requirement 9: Export Pipeline Preservation

**User Story:** As a music producer, I want my exported stems to reflect the pitch and tempo settings I chose during preview, so that the final output matches what I heard.

#### Acceptance Criteria

1. THE export pipeline SHALL continue to use `getStemEffectiveRate()` (the legacy coupled formula) for server-side FFmpeg processing
2. THE export pipeline SHALL NOT use the PitchTempoPlugin (which is a live-preview-only Web Audio component)
3. IF the user's pitch/tempo settings exceed the plugin's conservative range during export, THEN THE export pipeline SHALL apply the full requested values using the server-side rate-based approach

### Requirement 10: Plugin Initialization and Lifecycle

**User Story:** As a developer, I want the plugin to initialize reliably and clean up properly, so that the app doesn't leak AudioContext resources or AudioWorklet registrations.

#### Acceptance Criteria

1. WHEN the multi-stem editor mounts with decoded audio buffers, THE Playback_Orchestrator SHALL lazily create PitchTempoPlugin instances only when playback is requested (not on mount)
2. WHEN the multi-stem editor unmounts, THE Playback_Orchestrator SHALL destroy all active PitchTempoPlugin instances and disconnect their nodes
3. IF AudioWorklet registration fails (e.g., due to CSP restrictions on blob: URLs), THEN THE Playback_Orchestrator SHALL fall back to the legacy `playbackRate`-based approach and log a warning
4. THE Playback_Orchestrator SHALL reuse PitchTempoPlugin instances across play/stop cycles for the same stem, calling `plugin.reset()` between cycles rather than destroying and recreating

### Requirement 11: Latency Acceptance

**User Story:** As a music producer, I want to understand the processing latency so that I can set expectations for real-time monitoring responsiveness.

#### Acceptance Criteria

1. THE Phase_Vocoder SHALL introduce no more than 50ms of latency (approximately 2048 samples at 44100Hz)
2. THE system SHALL NOT attempt to compensate for plugin latency in the playhead display (the ~46ms offset is imperceptible for monitoring use cases)

### Requirement 12: Mixer DSP Chain Preservation

**User Story:** As a music producer, I want all my existing mixer effects (EQ, reverb, delay, compressor, pan, stereo width) to continue working exactly as before, so that the pitch/tempo upgrade doesn't break my mix.

#### Acceptance Criteria

1. THE DSP_Chain (EQ, reverb, delay, compressor, pan, stereo width) SHALL remain unchanged in its implementation and parameter behavior
2. THE PitchTempoPlugin output SHALL feed into the existing `DSP_Chain.input` (the gain node at the head of the chain)
3. WHEN mixer parameters change during playback, THE existing real-time DSP update mechanism SHALL continue to function without interference from the plugin

## Tools and References

### Tools Needed
- Vite (existing build system) — no new build tooling required
- The plugin's pre-built `dist/` folder (already compiled)
- Vitest (existing test runner) for integration tests

### Relevant Files
| File | Role in Integration |
|------|-------------------|
| `frontend/src/hooks/audio/useAudioPlayback.ts` | Primary modification target — insert plugin into audio graph |
| `frontend/src/utils/audio.ts` | Duration calculation updates, DSP chain remains unchanged |
| `frontend/src/stem-editor-state.ts` | State interface (no changes needed, already has pitchSemitones/timeStretch) |
| `frontend/src/utils/stemPlaybackUtils.ts` | Hot-swap signatures (no changes needed) |
| `frontend/src/hooks/audio/useAudioContext.ts` | AudioContext provider (no changes needed, shared with plugin) |
| `frontend/src/components/multi-stem-editor/pitch-tempo-plugin/dist/` | Pre-built plugin consumed as local import |
| `frontend/src/components/multi-stem-editor/pitch-tempo-plugin/src/dsp/PitchTempoPlugin.ts` | Plugin class API reference |

### Caution Areas
1. **AudioWorklet registration timing** — `plugin.ready()` is async; sources must not start before it resolves
2. **Plugin reset between plays** — forgetting `plugin.reset()` causes phase accumulator drift (audio sounds wrong on second play)
3. **CSP blob: restriction** — the worklet processor is registered via `URL.createObjectURL(new Blob([...]))` which requires `blob:` in CSP `script-src`
4. **Duration calculation divergence** — live preview uses `trimmedLength / tempoRatio` while export uses `trimmedLength / effectiveRate`; these must not be confused
5. **Reference stability** — plugin instances should be reused across play/stop cycles; recreating on every play wastes worklet registration overhead
6. **playbackRate must be 1.0** — when the plugin handles tempo, the source node's `playbackRate` must be set to unity or the two systems will conflict

### Success Criteria
1. Playing a stem with +3 semitones pitch shift produces audibly higher pitch at the same playback speed
2. Playing a stem with 0.85x tempo produces audibly slower playback at the same pitch
3. All existing mixer effects (EQ, reverb, delay, compressor, pan, width) continue to function
4. Hot-swap of pitch/tempo during playback produces no audible gap or click
5. Playhead position accurately reflects wall-clock time under tempo changes
6. Export pipeline continues to produce correct output using the legacy rate formula
7. No AudioContext leaks on mount/unmount cycles

### Verification Approach
1. **Manual A/B test**: Play a stem at +2 semitones — verify pitch is higher but duration unchanged (compare to legacy where duration shortens)
2. **Automated test**: Unit test that `getStemTrimWallDurationSeconds` returns correct duration for various tempo ratios
3. **Hot-swap test**: Adjust pitch slider during playback — verify no audio dropout
4. **Lifecycle test**: Mount/unmount the editor repeatedly — verify no "AudioContext was not allowed to start" warnings or context count growth
5. **Export test**: Export a stem with pitch/tempo adjustments — verify the exported file uses the legacy rate formula correctly

### Fallback Strategies
1. **Plugin init failure**: If `plugin.ready()` rejects (CSP, browser incompatibility), fall back to the existing `playbackRate`-based approach with a console warning
2. **Performance degradation**: If the phase vocoder causes audio underruns (detectable via `AudioContext.baseLatency` spikes), provide a user-facing toggle to disable the plugin and revert to legacy mode
3. **Range exceeded**: If future requirements need wider pitch/tempo ranges beyond ±3/±15%, the DSP layer can be swapped for Rubber Band WASM without changing the integration architecture
