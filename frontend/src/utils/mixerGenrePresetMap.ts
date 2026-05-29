/**
 * Maps backend genre mixer preset stem blocks to frontend MixerState.
 */
import { defaultMixer, type MixerState } from "../types";

type GenreStemBlock = {
  gain?: number;
  pan?: number;
  eq?: {
    enabled?: boolean;
    lowGain?: number;
    midGain?: number;
    highGain?: number;
  };
  compressor?: {
    enabled?: boolean;
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  };
  reverb?: {
    enabled?: boolean;
    wetLevel?: number;
  };
};

const STEM_ALIASES: Record<string, string> = {
  guitar: "melody",
};

export function linearGainToDb(linear: number): number {
  const g = Math.max(0.01, linear);
  return Math.round(20 * Math.log10(g) * 10) / 10;
}

export function mapGenreStemToMixer(block: GenreStemBlock): MixerState {
  const base = { ...defaultMixer };
  if (typeof block.gain === "number") {
    base.gain = linearGainToDb(block.gain);
  }
  if (typeof block.pan === "number") {
    base.pan = Math.round(block.pan * 100);
  }
  const eq = block.eq;
  if (eq?.enabled) {
    base.eqLow = eq.lowGain ?? base.eqLow;
    base.eqLowMid = eq.midGain ?? base.eqLowMid;
    base.eqHigh = eq.highGain ?? base.eqHigh;
  }
  const comp = block.compressor;
  if (comp?.enabled) {
    base.compThreshold = comp.threshold ?? base.compThreshold;
    base.compRatio = comp.ratio ?? base.compRatio;
    base.compAttackMs = comp.attack ?? base.compAttackMs;
    base.compReleaseMs = comp.release ?? base.compReleaseMs;
  }
  const rev = block.reverb;
  if (rev?.enabled && typeof rev.wetLevel === "number") {
    base.reverbWet = Math.round(rev.wetLevel * 100);
  }
  return base;
}

export function mapGenrePresetStems(
  stems: Record<string, GenreStemBlock>,
): Record<string, MixerState> {
  const out: Record<string, MixerState> = {};
  for (const [rawId, block] of Object.entries(stems)) {
    const id = STEM_ALIASES[rawId] ?? rawId;
    out[id] = mapGenreStemToMixer(block);
  }
  return out;
}
