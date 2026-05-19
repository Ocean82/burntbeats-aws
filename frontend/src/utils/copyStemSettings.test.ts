import { describe, expect, it } from "vitest";
import { defaultStemState } from "../stem-editor-state";
import { copyStemSettings } from "./copyStemSettings";

describe("copyStemSettings", () => {
  it("copies EQ only", () => {
    const source = defaultStemState();
    source.mixer.eqMid = 4;
    source.mixer.warmth = 50;
    const target = defaultStemState();
    const out = copyStemSettings(source, target, { scope: "eq" });
    expect(out.mixer.eqMid).toBe(4);
    expect(out.mixer.warmth).toBe(0);
  });

  it("copies pitch/time", () => {
    const source = defaultStemState();
    source.pitchSemitones = 5;
    source.timeStretch = 0.8;
    const out = copyStemSettings(source, defaultStemState(), { scope: "pitchTime" });
    expect(out.pitchSemitones).toBe(5);
    expect(out.timeStretch).toBe(0.8);
  });
});
