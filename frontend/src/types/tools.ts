/** Categories of audio processing tools available in the workspace. */
export type ToolCategory = 'pitch' | 'eq' | 'timeStretch' | 'amplitude' | 'fx' | 'intelligence';

/** State for the slide-out effects drawer. */
export interface ToolDrawerState {
  activeTool: ToolCategory | null;
  isOpen: boolean;
  open: (tool: ToolCategory) => void;
  close: () => void;
  toggle: (tool: ToolCategory) => void;
}

/** Pitch shift configuration. */
export interface PitchConfig {
  /** Semitones shift (-12 to +12) */
  semitones: number;
  /** Fine tune in cents (-100 to +100) */
  fineTune: number;
}

/** Three-band equalizer configuration. */
export interface EQConfig {
  /** Low band gain in dB (-12 to +12) */
  low: number;
  /** Mid band gain in dB (-12 to +12) */
  mid: number;
  /** High band gain in dB (-12 to +12) */
  high: number;
  /** Low crossover frequency in Hz (80-500) */
  lowFreq: number;
  /** High crossover frequency in Hz (2000-12000) */
  highFreq: number;
}

/** Time stretch configuration. */
export interface TimeStretchConfig {
  /** Playback speed multiplier (0.5 to 2.0) */
  speed: number;
  /** Whether to preserve pitch when stretching */
  preservePitch: boolean;
}

/** Amplitude / gain envelope configuration. */
export interface AmplitudeConfig {
  /** Gain multiplier (0 to 2.0) */
  gain: number;
  /** Fade-in duration in seconds */
  fadeIn: number;
  /** Fade-out duration in seconds */
  fadeOut: number;
}

/** Effects (reverb + delay) configuration. */
export interface FXConfig {
  /** Reverb wet/dry mix (0 to 1) */
  reverbMix: number;
  /** Reverb decay time in seconds (0.1 to 10) */
  reverbDecay: number;
  /** Delay time in seconds (0 to 2) */
  delayTime: number;
  /** Delay feedback amount (0 to 0.9) */
  delayFeedback: number;
  /** Delay wet/dry mix (0 to 1) */
  delayMix: number;
}

/** Discriminated union of all tool configurations. */
export type ToolConfig = PitchConfig | EQConfig | TimeStretchConfig | AmplitudeConfig | FXConfig;
