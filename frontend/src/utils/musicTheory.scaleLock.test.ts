import { describe, expect, it } from "vitest";
import {
  constrainPitch,
  parseEstimatedKey,
  quantizeToScale,
} from "./musicTheory";

describe("quantizeToScale", () => {
  it("snaps out-of-scale pitch to nearest scale degree in C major", () => {
    expect(quantizeToScale(61, "C", "major")).toBe(60);
    expect(quantizeToScale(62, "C", "major")).toBe(62);
  });

  it("returns chromatic pitches unchanged", () => {
    expect(quantizeToScale(61, "C", "chromatic")).toBe(61);
  });
});

describe("constrainPitch", () => {
  it("passes through when scale guide is unlocked", () => {
    expect(
      constrainPitch(61, { root: "C", scale: "major", locked: false }),
    ).toBe(61);
  });

  it("snaps when scale guide is locked", () => {
    expect(
      constrainPitch(61, { root: "C", scale: "major", locked: true }),
    ).toBe(60);
  });

  it("passes through when guide is null", () => {
    expect(constrainPitch(61, null)).toBe(61);
  });
});

describe("parseEstimatedKey", () => {
  it("parses major and minor keys", () => {
    expect(parseEstimatedKey("C major")).toEqual({
      root: "C",
      scale: "major",
    });
    expect(parseEstimatedKey("A minor")).toEqual({
      root: "A",
      scale: "minor",
    });
  });

  it("parses flat roots", () => {
    expect(parseEstimatedKey("Bb major")).toEqual({
      root: "A#",
      scale: "major",
    });
  });

  it("returns null for unknown keys", () => {
    expect(parseEstimatedKey("not a key")).toBeNull();
  });
});
