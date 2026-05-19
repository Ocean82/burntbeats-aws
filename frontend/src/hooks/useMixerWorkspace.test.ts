import { describe, expect, it } from "vitest";
import { defaultStemState } from "../stem-editor-state";
import { defaultMixer } from "../types";

describe("resetSingleStem logic", () => {
  it("resets only the target stem processing fields", () => {
    const states = {
      vocals: {
        ...defaultStemState(),
        pitchSemitones: 5,
        mixer: { ...defaultMixer, gain: 3 },
        muted: true,
      },
      drums: {
        ...defaultStemState(),
        pitchSemitones: -2,
        mixer: { ...defaultMixer, eqMid: 4 },
      },
    };

    const stemId = "vocals";
    const prev = states[stemId];
    const next = {
      ...prev,
      trim: { start: 0, end: 100 },
      mixer: { ...defaultMixer },
      rate: 1.0,
      pitchSemitones: 0,
      timeStretch: 1.0,
    };

    const updated = { ...states, [stemId]: next };

    expect(updated.vocals.pitchSemitones).toBe(0);
    expect(updated.vocals.mixer.gain).toBe(0);
    expect(updated.vocals.muted).toBe(true);
    expect(updated.drums.pitchSemitones).toBe(-2);
    expect(updated.drums.mixer.eqMid).toBe(4);
  });
});
