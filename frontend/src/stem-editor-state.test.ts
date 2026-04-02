import { describe, expect, it } from "vitest";
import { defaultStemState, getStemEffectiveRate } from "./stem-editor-state";

describe("getStemEffectiveRate", () => {
  it("uses legacy rate when pitch and timeStretch are absent (old persisted state)", () => {
    const base = defaultStemState();
    const st = {
      ...base,
      rate: 1.5,
    };
    delete (st as { pitchSemitones?: number }).pitchSemitones;
    delete (st as { timeStretch?: number }).timeStretch;
    expect(getStemEffectiveRate(st)).toBeCloseTo(1.5, 5);
  });

  it("uses pitch and stretch when present", () => {
    const st = defaultStemState();
    st.pitchSemitones = 12;
    st.timeStretch = 1;
    expect(getStemEffectiveRate(st)).toBeCloseTo(2, 5);
  });
});
