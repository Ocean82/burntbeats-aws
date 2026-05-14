/**
 * Pitch-Plug-in: Shared types for integration
 */

export interface StemInput {
  /** Unique identifier for this stem */
  id: string;
  /** Display label (e.g. "Vocals", "Drums") */
  label: string;
  /** Emoji icon for the stem */
  emoji?: string;
  /** Accent color (hex string) */
  color: string;
  /** Decoded audio buffer from the stem splitter */
  buffer: AudioBuffer;
}

export interface StemState {
  id: string;
  label: string;
  emoji: string;
  color: string;
  buffer: AudioBuffer | null;
  pitchSemitones: number;
  tempoRatio: number;
  muted: boolean;
  solo: boolean;
  bypass: boolean;
}

export type StemMode = 'global' | 'per-stem';

export interface PitchTempoEngineState {
  /** Whether the audio engine is initialized and ready */
  engineReady: boolean;
  /** Human-readable engine status */
  engineStatus: string;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Current playback position in seconds */
  currentTime: number;
  /** Total duration of the longest stem in seconds */
  duration: number;
  /** Global/per-stem mode */
  stemMode: StemMode;
  /** Global pitch in semitones */
  globalPitch: number;
  /** Global tempo ratio */
  globalTempo: number;
  /** Whether global bypass is active */
  globalBypass: boolean;
  /** Whether pitch and tempo are linked */
  linked: boolean;
  /** Per-stem state */
  stems: StemState[];
}

export interface PitchTempoEngineActions {
  /** Start playback */
  play: () => Promise<void>;
  /** Pause playback */
  pause: () => void;
  /** Stop playback and reset position */
  stop: () => void;
  /** Set global pitch in semitones (clamped to range) */
  setGlobalPitch: (semitones: number) => void;
  /** Set global tempo ratio (clamped to range) */
  setGlobalTempo: (ratio: number) => void;
  /** Toggle global bypass */
  setGlobalBypass: (enabled: boolean) => void;
  /** Toggle linked pitch/tempo mode */
  setLinked: (linked: boolean) => void;
  /** Reset pitch and tempo to defaults */
  reset: () => void;
  /** Switch between global and per-stem mode */
  setStemMode: (mode: StemMode) => void;
  /** Set pitch for a specific stem (per-stem mode) */
  setStemPitch: (stemId: string, semitones: number) => void;
  /** Set tempo for a specific stem (per-stem mode) */
  setStemTempo: (stemId: string, ratio: number) => void;
  /** Toggle mute on a stem */
  toggleMute: (stemId: string) => void;
  /** Toggle solo on a stem */
  toggleSolo: (stemId: string) => void;
  /** Toggle bypass on a stem */
  toggleBypass: (stemId: string) => void;
  /** Get the AnalyserNode for visualization */
  getAnalyserNode: () => AnalyserNode | null;
}

export interface PitchTempoEngine extends PitchTempoEngineState, PitchTempoEngineActions {}

export interface PitchTempoPluginProps {
  /** 
   * Array of stem inputs from the parent app (e.g. from a stem splitter).
   * When this changes, the engine re-initializes with the new stems.
   */
  stems: StemInput[];
  /**
   * Optional: provide your own AudioContext (shared with parent app).
   * If not provided, the plugin creates its own.
   */
  audioContext?: AudioContext;
  /**
   * Optional: callback when engine state changes.
   */
  onStateChange?: (state: PitchTempoEngineState) => void;
  /**
   * Optional: callback when playback completes.
   */
  onPlaybackEnd?: () => void;
  /**
   * Optional: compact layout mode for embedding.
   */
  compact?: boolean;
  /**
   * Optional: hide specific UI sections.
   */
  hideSections?: ('spectrum' | 'transport' | 'stems' | 'metadata')[];
  /**
   * Optional: custom class name for the root container.
   */
  className?: string;
}
