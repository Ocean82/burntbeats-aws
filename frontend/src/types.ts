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
  /** Peaking EQ gain in dB at ~1kHz (-12 to +12). */
  eqMid: number;
  /** High-shelf EQ gain in dB (-12 to +12). */
  eqHigh: number;
  /** Reverb wet mix 0–100. */
  reverbWet: number;
  /** Delay wet mix 0–100. */
  delayWet: number;
  /** Compressor threshold in dB (-60 to 0). */
  compThreshold: number;
  /** Compressor ratio (1–20). */
  compRatio: number;
};

export type TrimState = {
  start: number;
  end: number;
};

export const defaultTrim: TrimState = { start: 0, end: 100 };
export const defaultMixer: MixerState = {
  gain: 0,
  pan: 0,
  width: 80,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  reverbWet: 0,
  delayWet: 0,
  compThreshold: 0,
  compRatio: 1,
};
