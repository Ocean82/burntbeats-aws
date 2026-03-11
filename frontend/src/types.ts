export type StemId = "vocals" | "drums" | "bass" | "melody" | "instrumental" | "other";

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
  send: number;
};

export type TrimState = {
  start: number;
  end: number;
};

export const defaultTrim: TrimState = { start: 8, end: 92 };
export const defaultMixer: MixerState = { gain: 0, pan: 0, width: 80, send: 0 };
