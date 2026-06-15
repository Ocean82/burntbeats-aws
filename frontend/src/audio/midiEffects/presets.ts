import type { MidiEffectsConfig } from "./types";
import { defaultMidiEffects } from "./types";

export type MidiFxApplyMode = "replace" | "duplicate";

export interface MidiEffectsPreset {
  id: string;
  name: string;
  description: string;
  config: MidiEffectsConfig;
}

export function cloneMidiEffects(config: MidiEffectsConfig): MidiEffectsConfig {
  return JSON.parse(JSON.stringify(config)) as MidiEffectsConfig;
}

export const MIDI_FX_PRESETS: MidiEffectsPreset[] = [
  {
    id: "octave-up",
    name: "Octave Up",
    description: "Shift melody up one octave",
    config: {
      ...defaultMidiEffects(),
      transposer: { semitones: 0, octaves: 1 },
    },
  },
  {
    id: "fifth-stack",
    name: "Fifth Stack",
    description: "Transpose up a perfect fifth",
    config: {
      ...defaultMidiEffects(),
      transposer: { semitones: 7, octaves: 0 },
    },
  },
  {
    id: "minor-lock",
    name: "Minor Lock",
    description: "Snap notes to A natural minor",
    config: {
      ...defaultMidiEffects(),
      quantizer: {
        enabled: true,
        scale: "minor",
        root: "A",
        strength: 1,
      },
    },
  },
  {
    id: "pad-chords",
    name: "Pad Chords",
    description: "Expand single notes to major triads",
    config: {
      ...defaultMidiEffects(),
      chordGenerator: {
        enabled: true,
        chordType: "major",
        voicing: "open",
        inversion: 0,
        strumSpeed: 0.02,
      },
    },
  },
  {
    id: "arp-up",
    name: "Arp Up",
    description: "Classic upward arpeggio",
    config: {
      ...defaultMidiEffects(),
      arpeggiator: {
        enabled: true,
        pattern: "up",
        rate: 8,
        octaves: 2,
        gateLength: 0.75,
      },
    },
  },
  {
    id: "stutter",
    name: "Stutter",
    description: "Fast note repeats with decay",
    config: {
      ...defaultMidiEffects(),
      noteRepeater: {
        enabled: true,
        rate: 16,
        repeats: 6,
        velocityDecay: 0.25,
        pitchOffset: 0,
      },
    },
  },
  {
    id: "dream-arp",
    name: "Dream Arp",
    description: "Maj7 chords with slow up-down arp",
    config: {
      ...defaultMidiEffects(),
      chordGenerator: {
        enabled: true,
        chordType: "maj7",
        voicing: "close",
        inversion: 0,
        strumSpeed: 0,
      },
      arpeggiator: {
        enabled: true,
        pattern: "updown",
        rate: 4,
        octaves: 1,
        gateLength: 0.85,
      },
    },
  },
];

export function getMidiFxPreset(id: string): MidiEffectsPreset | undefined {
  return MIDI_FX_PRESETS.find((preset) => preset.id === id);
}
