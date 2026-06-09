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
