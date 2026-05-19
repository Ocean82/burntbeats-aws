import { describe, expect, it } from "vitest";
import { defaultStemState } from "../stem-editor-state";
import { isStemModified } from "./isStemModified";

describe("isStemModified", () => {
  it("returns false for default state", () => {
    expect(isStemModified(defaultStemState())).toBe(false);
  });

  it("detects pitch change", () => {
    const s = defaultStemState();
    s.pitchSemitones = 2;
    expect(isStemModified(s)).toBe(true);
  });

  it("detects EQ change", () => {
    const s = defaultStemState();
    s.mixer.eqLowMid = 3;
    expect(isStemModified(s)).toBe(true);
  });
});
