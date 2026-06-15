import { describe, expect, it } from "vitest";
import {
  applyMidiEffects,
  hasActiveMidiEffects,
} from "./applyMidiEffects";
import { defaultMidiEffects } from "./types";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";

const baseNotes: MidiNoteEvent[] = [
  { pitch: 60, velocity: 100, start: 0, duration: 0.5 },
  { pitch: 64, velocity: 90, start: 0, duration: 0.5 },
  { pitch: 67, velocity: 80, start: 0, duration: 0.5 },
];

describe("applyMidiEffects", () => {
  it("returns empty for empty input", () => {
    expect(applyMidiEffects([], defaultMidiEffects(), 120)).toEqual([]);
  });

  it("transposes by semitones", () => {
    const config = defaultMidiEffects();
    config.transposer.semitones = 2;
    const result = applyMidiEffects(baseNotes, config, 120);
    expect(result.map((n) => n.pitch)).toEqual([62, 66, 69]);
  });

  it("expands chords when chord generator is enabled", () => {
    const config = defaultMidiEffects();
    config.chordGenerator.enabled = true;
    config.chordGenerator.chordType = "major";
    const result = applyMidiEffects(
      [{ pitch: 60, velocity: 100, start: 1, duration: 0.25 }],
      config,
      120,
    );
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((n) => n.start >= 1)).toBe(true);
  });

  it("detects active effects", () => {
    const idle = defaultMidiEffects();
    expect(hasActiveMidiEffects(idle)).toBe(false);

    const transposed = defaultMidiEffects();
    transposed.transposer.semitones = 1;
    expect(hasActiveMidiEffects(transposed)).toBe(true);
  });

  it("supports duplicate-friendly output with more notes than input", () => {
    const config = defaultMidiEffects();
    config.chordGenerator.enabled = true;
    config.chordGenerator.chordType = "major";
    const input = [{ pitch: 60, velocity: 100, start: 0, duration: 0.5 }];
    const result = applyMidiEffects(input, config, 120);
    expect(result.length).toBeGreaterThan(input.length);
  });
});
