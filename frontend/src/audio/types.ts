/**
 * Shared types for the beat maker / rhythm system.
 */

/** General MIDI drum instruments with their standard MIDI note numbers. */
export type DrumInstrument =
  | "kick"
  | "snare"
  | "closedHat"
  | "openHat"
  | "clap"
  | "ride"
  | "tomHi"
  | "tomLo";

export interface DrumVoice {
  id: DrumInstrument;
  label: string;
  /** General MIDI drum note number */
  pitch: number;
  /** Short label (1-3 chars) for compact display */
  shortLabel: string;
}

/** Velocity value: 0 = off, 1-127 = MIDI velocity */
export type CellVelocity = number;

/** A pattern is rows × steps of velocity values. */
export type VelocityPattern = CellVelocity[][];

/** Per-row state for mute/solo. */
export interface RowState {
  muted: boolean;
  solo: boolean;
  volume: number; // 0-1
}

/** Supported pattern step counts. */
export type PatternLength = 16 | 32 | 64;

/** Velocity presets for quick toggle. */
export const VELOCITY_OFF = 0;
export const VELOCITY_GHOST = 40;
export const VELOCITY_NORMAL = 100;
export const VELOCITY_ACCENT = 127;

/** The default kit — 8 instruments covering common drum voices. */
export const DEFAULT_KIT: DrumVoice[] = [
  { id: "kick", label: "Kick", pitch: 36, shortLabel: "KK" },
  { id: "snare", label: "Snare", pitch: 38, shortLabel: "SN" },
  { id: "closedHat", label: "Closed HH", pitch: 42, shortLabel: "CH" },
  { id: "openHat", label: "Open HH", pitch: 46, shortLabel: "OH" },
  { id: "clap", label: "Clap", pitch: 39, shortLabel: "CP" },
  { id: "ride", label: "Ride", pitch: 51, shortLabel: "RD" },
  { id: "tomHi", label: "Tom Hi", pitch: 48, shortLabel: "TH" },
  { id: "tomLo", label: "Tom Lo", pitch: 45, shortLabel: "TL" },
];

// ─── Kit System ──────────────────────────────────────────────────

export type KitId = "default" | "808" | "acoustic" | "electronic" | "lofi";

export interface KitPreset {
  id: KitId;
  label: string;
  description: string;
  color: string;
}

export const KIT_PRESETS: KitPreset[] = [
  { id: "default", label: "Default", description: "Balanced modern", color: "var(--accent-midi)" },
  { id: "808", label: "808", description: "Deep subby booms", color: "#ff6b35" },
  { id: "acoustic", label: "Acoustic", description: "Bright & punchy", color: "#4ade80" },
  { id: "electronic", label: "Electronic", description: "Crisp synthetic", color: "#60a5fa" },
  { id: "lofi", label: "Lo-Fi", description: "Warm & dusty", color: "#f472b6" },
];

// Synthesis parameter overrides per kit per instrument.
// Undefined = use the synth function's built-in default.
export interface KitVoiceParams {
  [instrument: string]: Record<string, number | undefined> | undefined;
  kick?: {
    startFreq?: number;
    endFreq?: number;
    bodyDecay?: number;
    clickFreq?: number;
    clickDecay?: number;
    bodyVol?: number;
    clickVol?: number;
  };
  snare?: {
    bodyFreq?: number;
    bodyEndFreq?: number;
    bodyDecay?: number;
    noiseHP?: number;
    noiseVol?: number;
    noiseDecay?: number;
    bodyVol?: number;
  };
  closedHat?: {
    hpFreq?: number;
    bpFreq?: number;
    bpQ?: number;
    vol?: number;
    decay?: number;
  };
  openHat?: {
    hpFreq?: number;
    bpFreq?: number;
    bpQ?: number;
    vol?: number;
    decay?: number;
  };
  clap?: {
    burstCount?: number;
    bpFreq?: number;
    bpQ?: number;
    burstVol?: number;
    burstGap?: number;
    burstLen?: number;
    tailBpFreq?: number;
    tailVol?: number;
    tailDecay?: number;
  };
  ride?: {
    freqs1?: number;
    freqs2?: number;
    freqs3?: number;
    oscVol?: number;
    noiseHP?: number;
    noiseVol?: number;
    noiseDecay?: number;
  };
  tomHi?: {
    baseFreq?: number;
    startMult?: number;
    endMult?: number;
    decay?: number;
    bodyVol?: number;
    bodyDecay?: number;
  };
  tomLo?: {
    baseFreq?: number;
    startMult?: number;
    endMult?: number;
    decay?: number;
    bodyVol?: number;
    bodyDecay?: number;
  };
}

export interface KitDefinition {
  id: KitId;
  params: KitVoiceParams;
}

export const KIT_DEFINITIONS: KitDefinition[] = [
  {
    id: "default",
    params: {},
  },
  {
    id: "808",
    params: {
      kick: { startFreq: 120, endFreq: 35, bodyDecay: 0.5, clickFreq: 300, clickDecay: 0.02, bodyVol: 1.0, clickVol: 0.3 },
      snare: { bodyVol: 0.35, noiseVol: 0.5, noiseDecay: 0.12, bodyFreq: 180, bodyDecay: 0.06 },
      closedHat: { decay: 0.08, vol: 0.35, bpFreq: 8000 },
      openHat: { decay: 0.4, vol: 0.4, bpFreq: 7000 },
      clap: { tailDecay: 0.2, burstVol: 0.3 },
      ride: { noiseDecay: 0.6, oscVol: 0.06 },
      tomHi: { baseFreq: 180, decay: 0.3 },
      tomLo: { baseFreq: 90, decay: 0.35 },
    },
  },
  {
    id: "acoustic",
    params: {
      kick: { startFreq: 200, endFreq: 55, bodyDecay: 0.18, clickFreq: 600, clickDecay: 0.015, bodyVol: 0.9, clickVol: 0.5 },
      snare: { bodyVol: 0.6, noiseVol: 0.8, noiseDecay: 0.1, bodyFreq: 250, bodyDecay: 0.05 },
      closedHat: { decay: 0.03, vol: 0.5, hpFreq: 8000, bpFreq: 12000 },
      openHat: { decay: 0.12, vol: 0.55, hpFreq: 7000, bpFreq: 11000 },
      clap: { tailDecay: 0.08, burstVol: 0.45, burstCount: 4 },
      ride: { noiseDecay: 0.25, oscVol: 0.1 },
      tomHi: { baseFreq: 220, decay: 0.15, bodyVol: 0.85 },
      tomLo: { baseFreq: 110, decay: 0.2, bodyVol: 0.85 },
    },
  },
  {
    id: "electronic",
    params: {
      kick: { startFreq: 180, endFreq: 45, bodyDecay: 0.12, clickFreq: 800, clickDecay: 0.008, bodyVol: 0.95, clickVol: 0.6 },
      snare: { bodyVol: 0.45, noiseVol: 0.65, noiseDecay: 0.08, bodyFreq: 200, bodyDecay: 0.04 },
      closedHat: { decay: 0.025, vol: 0.45, hpFreq: 9000, bpFreq: 14000, bpQ: 1.5 },
      openHat: { decay: 0.08, vol: 0.5, hpFreq: 8000, bpFreq: 13000 },
      clap: { tailDecay: 0.06, burstVol: 0.4, burstCount: 2 },
      ride: { noiseDecay: 0.15, oscVol: 0.12 },
      tomHi: { baseFreq: 200, decay: 0.1, bodyVol: 0.8 },
      tomLo: { baseFreq: 100, decay: 0.12, bodyVol: 0.8 },
    },
  },
  {
    id: "lofi",
    params: {
      kick: { startFreq: 140, endFreq: 45, bodyDecay: 0.25, clickFreq: 250, clickDecay: 0.04, bodyVol: 0.85, clickVol: 0.25 },
      snare: { bodyVol: 0.4, noiseVol: 0.55, noiseDecay: 0.15, bodyFreq: 160, bodyDecay: 0.1 },
      closedHat: { decay: 0.12, vol: 0.3, hpFreq: 5000, bpFreq: 7000 },
      openHat: { decay: 0.35, vol: 0.35, hpFreq: 4500, bpFreq: 6500 },
      clap: { tailDecay: 0.18, burstVol: 0.35, burstCount: 5 },
      ride: { noiseDecay: 0.5, oscVol: 0.05 },
      tomHi: { baseFreq: 160, decay: 0.25, bodyVol: 0.7 },
      tomLo: { baseFreq: 80, decay: 0.3, bodyVol: 0.7 },
    },
  },
];

export function getKitParams(kitId: KitId, instrument: DrumInstrument): Record<string, number> | undefined {
  const kit = KIT_DEFINITIONS.find((k) => k.id === kitId);
  return kit?.params[instrument];
}
