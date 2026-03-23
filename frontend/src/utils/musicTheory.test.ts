import { describe, it, expect } from "vitest";
import { freqToMidi, getFreqName, midiToFreq, midiToNoteName, quantizeToScale } from "./musicTheory";

describe("musicTheory", () => {
  it("midiToFreq A4 is 440Hz", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
  });

  it("midiToNoteName", () => {
    expect(midiToNoteName(69)).toBe("A4");
  });

  it("freqToMidi rounds to nearest note", () => {
    expect(freqToMidi(440)).toBe(69);
  });

  it("getFreqName near A4", () => {
    const { note, octave } = getFreqName(440);
    expect(note).toBe("A");
    expect(octave).toBe(4);
  });

  it("quantizeToScale leaves chromatic unchanged", () => {
    expect(quantizeToScale(60, "C", "chromatic")).toBe(60);
  });
});
