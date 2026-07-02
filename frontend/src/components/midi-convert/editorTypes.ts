export type EditorTool = "select" | "draw" | "erase" | "split";

import type { MidiEffectsConfig } from "../../audio/midiEffects/types";
import { defaultMidiEffects } from "../../audio/midiEffects/types";

export type SnapGrid =
  | "1/4"
  | "1/8"
  | "1/16"
  | "1/32"
  | "1/6"
  | "1/12"
  | "1T"
  | "dotted"
  | "shuffle"
  | "free";

export interface TimeSignature {
  beatsPerBar: number;
  beatUnit: number;
}

export const DEFAULT_TIME_SIG: TimeSignature = { beatsPerBar: 4, beatUnit: 4 };

export interface LoopRegion {
  enabled: boolean;
  start: number;
  end: number;
}

export const DEFAULT_LOOP: LoopRegion = {
  enabled: false,
  start: 0,
  end: 4,
};

export interface CcPoint {
  time: number;
  value: number;
}

export interface CcLane {
  ccNumber: number;
  name: string;
  events: CcPoint[];
  visible: boolean;
}

export const BUILTIN_CC_LANES: Omit<CcLane, "events">[] = [
  { ccNumber: 1, name: "Mod Wheel", visible: false },
  { ccNumber: 7, name: "Volume", visible: false },
  { ccNumber: 10, name: "Pan", visible: false },
  { ccNumber: 11, name: "Expression", visible: false },
  { ccNumber: 64, name: "Sustain", visible: false },
];

export interface EditableNote {
  id: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
  muted?: boolean;
  channel?: number;
}

export type TrackInstrument = "piano" | "synth" | "bass" | "strings";

export type MidiFxApplyMode = "replace" | "duplicate";

export const DEFAULT_MIDI_FX_APPLY_MODE: MidiFxApplyMode = "replace";

export function createDefaultTrackMidiFx(): MidiEffectsConfig {
  return defaultMidiEffects();
}

export const TRACK_INSTRUMENTS: { value: TrackInstrument; label: string }[] = [
  { value: "piano", label: "Piano" },
  { value: "synth", label: "Synth" },
  { value: "bass", label: "Bass" },
  { value: "strings", label: "Strings" },
];

export interface EditorTrack {
  id: string;
  name: string;
  notes: EditableNote[];
  selectedIds: Set<string>;
  color: string;
  muted: boolean;
  soloed: boolean;
  instrument: TrackInstrument;
  ccLanes: CcLane[];
  midiEffects: MidiEffectsConfig;
  midiFxApplyMode: MidiFxApplyMode;
  midiFxPreview: boolean;
  /** Batch stem conversion job — enables per-stem save back to server. */
  sourceJobId?: string | null;
  sourceJobToken?: string | null;
}

export type ActiveLane = "notes" | "velocity" | "cc" | "automation";

export type AutomationParam = "volume" | "pan" | "filter";

export const AUTOMATION_PARAMS: {
  param: AutomationParam;
  ccNumber: number;
  label: string;
}[] = [
  { param: "volume", ccNumber: 7, label: "Volume" },
  { param: "pan", ccNumber: 10, label: "Pan" },
  { param: "filter", ccNumber: 74, label: "Filter Cutoff" },
];

export interface EditorViewState {
  activeLane: ActiveLane;
  activeCcNumber: number;
  showTrackList: boolean;
}

export const TRACK_COLORS = [
  "#cd9d3c",
  "#3c9dcd",
  "#9d3ccd",
  "#3ccd9d",
  "#cd3c3c",
  "#3c3ccd",
  "#cd7c3c",
  "#7ccd3c",
];

export function generateTrackId(): string {
  return `track_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateNoteId(): string {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
