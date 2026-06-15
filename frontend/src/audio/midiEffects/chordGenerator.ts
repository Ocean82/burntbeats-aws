import { CHORD_TYPES } from "../../utils/musicTheory";
import type { ChordGeneratorConfig, MidiEffectEvent } from "./types";

export class MidiChordGenerator {
  constructor(private config: ChordGeneratorConfig) {}

  updateConfig(config: Partial<ChordGeneratorConfig>) {
    this.config = { ...this.config, ...config };
  }

  process(events: MidiEffectEvent[]): MidiEffectEvent[] {
    if (!this.config.enabled) return events;

    const result: MidiEffectEvent[] = [];

    for (const event of events) {
      const chordPitches = this.generateChord(event.pitch);
      chordPitches.forEach((pitch, index) => {
        result.push({
          ...event,
          pitch,
          start: event.start + index * this.config.strumSpeed,
        });
      });
    }

    return result;
  }

  generateChord(rootPitch: number): number[] {
    const octave = Math.floor(rootPitch / 12);
    const pitchClass = rootPitch % 12;

    const chord = CHORD_TYPES[this.config.chordType] ?? CHORD_TYPES.major;
    let notes = chord.intervals.map(
      (interval) => octave * 12 + pitchClass + interval,
    );

    notes = this.applyVoicing(notes);
    notes = this.applyInversion(notes);

    return notes.filter((n) => n >= 0 && n <= 127);
  }

  private applyVoicing(notes: number[]): number[] {
    switch (this.config.voicing) {
      case "open":
        return notes.map((note, i) => note + Math.floor(i / 2) * 12);
      case "drop2":
        if (notes.length >= 2) {
          const copy = [...notes];
          copy[copy.length - 2] -= 12;
          return copy.sort((a, b) => a - b);
        }
        return notes;
      case "drop3":
        if (notes.length >= 3) {
          const copy = [...notes];
          copy[copy.length - 3] -= 12;
          return copy.sort((a, b) => a - b);
        }
        return notes;
      case "close":
      default:
        return notes;
    }
  }

  private applyInversion(notes: number[]): number[] {
    if (this.config.inversion === 0 || notes.length === 0) return notes;

    const copy = [...notes];
    const inversions = this.config.inversion % copy.length;

    for (let i = 0; i < inversions; i++) {
      const lowest = copy.shift();
      if (lowest === undefined) break;
      copy.push(lowest + 12);
    }

    return copy;
  }
}
