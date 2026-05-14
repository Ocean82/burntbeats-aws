/**
 * Pitch-Plug-in — Public API
 *
 * Integration with a stem-splitting app:
 *
 * ```tsx
 * import {
 *   PitchTempoWidget,       // Drop-in UI component
 *   useAudioEngine,         // Headless hook (build your own UI)
 *   PitchTempoPlugin,       // Low-level DSP plugin class
 *   PARAM_META,             // Parameter ranges/defaults
 * } from './pitch-plugin';
 * ```
 */

// ── Main widget (batteries-included UI) ──────────────────────
export { PitchTempoWidget } from './PitchTempoWidget';

// ── Headless hook (bring your own UI) ────────────────────────
export { useAudioEngine } from './hooks/useAudioEngine';
export type { UseAudioEngineOptions } from './hooks/useAudioEngine';

// ── DSP core ─────────────────────────────────────────────────
export {
  PitchTempoPlugin,
  StemPluginManager,
  semitonesToRatio,
  ratioToSemitones,
  tempoToPercent,
  pitchToSemitonesStr,
  PARAM_META,
} from './dsp/PitchTempoPlugin';
export type { PitchTempoPluginOptions, QualityMode } from './dsp/PitchTempoPlugin';

// ── UI components (composable) ───────────────────────────────
export { KnobControl } from './components/KnobControl';
export { StemTrack } from './components/StemTrack';
export { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
export { WaveformDisplay } from './components/WaveformDisplay';

// ── Types ────────────────────────────────────────────────────
export type {
  StemInput,
  StemState,
  StemMode,
  PitchTempoEngineState,
  PitchTempoEngineActions,
  PitchTempoEngine,
  PitchTempoPluginProps,
} from './types';

// ── Test utilities (for development/QA) ──────────────────────
export { runAllTests } from './dsp/pluginTests';
export type { TestResult } from './dsp/pluginTests';
export { generateStemBuffers, generateTestSine, detectDominantFrequency } from './dsp/syntheticAudio';
export type { StemAudioData } from './dsp/syntheticAudio';
