import type { RootNote, Scale } from "../../utils/musicTheory";

export interface MidiEffectEvent {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

export type ArpPattern =
  | "up"
  | "down"
  | "updown"
  | "downup"
  | "random"
  | "chord"
  | "played";

export interface ArpeggiatorConfig {
  enabled: boolean;
  pattern: ArpPattern;
  rate: number;
  octaves: number;
  gateLength: number;
}

export interface QuantizerConfig {
  enabled: boolean;
  scale: Scale;
  root: RootNote;
  strength: number;
}

export interface NoteRepeaterConfig {
  enabled: boolean;
  rate: number;
  repeats: number;
  velocityDecay: number;
  pitchOffset: number;
}

export interface TransposerConfig {
  semitones: number;
  octaves: number;
}

export type ChordType =
  | "major"
  | "minor"
  | "maj7"
  | "min7"
  | "dom7"
  | "sus2"
  | "sus4"
  | "dim"
  | "aug"
  | "add9"
  | "dim7"
  | "m7b5"
  | "aug7"
  | "7sus4"
  | "9"
  | "maj9"
  | "m9"
  | "11"
  | "13"
  | "madd9"
  | "6"
  | "m6"
  | "7b9"
  | "7#9"
  | "7b5"
  | "7#5";

export interface ChordGeneratorConfig {
  enabled: boolean;
  chordType: ChordType;
  voicing: "close" | "open" | "drop2" | "drop3";
  inversion: number;
  strumSpeed: number;
}

export interface MidiEffectsConfig {
  transposer: TransposerConfig;
  quantizer: QuantizerConfig;
  chordGenerator: ChordGeneratorConfig;
  noteRepeater: NoteRepeaterConfig;
  arpeggiator: ArpeggiatorConfig;
}

export function defaultMidiEffects(): MidiEffectsConfig {
  return {
    transposer: { semitones: 0, octaves: 0 },
    quantizer: {
      enabled: false,
      scale: "major",
      root: "C",
      strength: 1,
    },
    chordGenerator: {
      enabled: false,
      chordType: "major",
      voicing: "close",
      inversion: 0,
      strumSpeed: 0,
    },
    noteRepeater: {
      enabled: false,
      rate: 8,
      repeats: 3,
      velocityDecay: 0.2,
      pitchOffset: 0,
    },
    arpeggiator: {
      enabled: false,
      pattern: "up",
      rate: 4,
      octaves: 1,
      gateLength: 0.8,
    },
  };
}
