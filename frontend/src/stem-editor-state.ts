import type { MixerState, TrimState } from "./types";
import { defaultMixer, defaultTrim } from "./types";

export interface StemEditorState {
  trim: TrimState;
  mixer: MixerState;
  /** Playback rate (derived from pitch + timeStretch when both set; otherwise legacy 0.5–2.0). */
  rate: number;
  /** Pitch shift in semitones (-12 to +12). Combined with timeStretch for effective rate. */
  pitchSemitones: number;
  /** Time stretch: 0.5 = half duration, 2 = double. 1 = normal. */
  timeStretch: number;
  muted: boolean;
  soloed: boolean;
}

/** Effective playback rate from pitch and time stretch: rate = 2^(pitch/12) / timeStretch. */
export function getStemEffectiveRate(state: StemEditorState): number {
  const hasNewFields = state.pitchSemitones != null || state.timeStretch != null;
  if (!hasNewFields) return state.rate ?? 1;
  const pitch = state.pitchSemitones ?? 0;
  const stretch = state.timeStretch ?? 1;
  if (stretch > 0) return Math.pow(2, pitch / 12) / stretch;
  return state.rate ?? 1;
}

export function defaultStemState(): StemEditorState {
  return {
    trim: { ...defaultTrim },
    mixer: { ...defaultMixer },
    rate: 1.0,
    pitchSemitones: 0,
    timeStretch: 1.0,
    muted: false,
    soloed: false,
  };
}
