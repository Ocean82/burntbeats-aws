export type StemId = "vocals" | "drums" | "bass" | "melody" | "instrumental" | "other";

export type StemResult = {
  id: string;
  url: string;
  path?: string;
};

export type StemDefinition = {
  id: StemId;
  label: string;
  subtitle: string;
  flavor: string;
  glow: string;
  glowSoft: string;
  waveform: number[];
};

export type MixerState = {
  gain: number;
  pan: number;
  width: number;
  /** Low-shelf EQ gain in dB (-12 to +12). */
  eqLow: number;
  /** Peaking EQ gain in dB at ~400 Hz (-12 to +12). */
  eqLowMid: number;
  /** Peaking EQ gain in dB at ~1kHz (-12 to +12). */
  eqMid: number;
  /** High-shelf EQ gain in dB (-12 to +12). */
  eqHigh: number;
  /** Harmonic saturation amount 0–100 (0 = bypass, 100 = heavy warmth). Adds even-order harmonics via soft-clip waveshaping. */
  warmth: number;
  /** Air/presence boost in dB (-12 to +12). High-shelf at ~10kHz for clarity and "air". */
  presence: number;
  /** Reverb wet mix 0–100. */
  reverbWet: number;
  /** Delay wet mix 0–100. */
  delayWet: number;
  /** Compressor threshold in dB (-60 to 0). */
  compThreshold: number;
  /** Compressor ratio (1–20). */
  compRatio: number;
  /** Compressor attack in ms (1–200). */
  compAttackMs: number;
  /** Compressor release in ms (10–1000). */
  compReleaseMs: number;
};

export type TrimState = {
  start: number;
  end: number;
};

export const defaultTrim: TrimState = { start: 0, end: 100 };

export const defaultMixer: MixerState = {
  gain: 0,
  pan: 0,
  width: 100,
  eqLow: 0,
  eqLowMid: 0,
  eqMid: 0,
  eqHigh: 0,
  warmth: 0,
  presence: 0,
  reverbWet: 0,
  delayWet: 0,
  compThreshold: 0,
  compRatio: 1,
  compAttackMs: 10,
  compReleaseMs: 100,
};

/** Merge partial mixer state with defaults (backward-compatible presets/saves). */
export function mergeMixerState(partial?: Partial<MixerState>): MixerState {
  return { ...defaultMixer, ...partial };
}
