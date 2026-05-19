import { describe, expect, it } from "vitest";
import {
  clampPitch,
  clampTimeStretch,
  TEMPO_RATIO_MAX,
  TEMPO_RATIO_MIN,
  timeStretchToDisplayPercent,
} from "./mixerRanges";

describe("mixerRanges", () => {
  it("clamps pitch to ±12", () => {
    expect(clampPitch(-20)).toBe(-12);
    expect(clampPitch(20)).toBe(12);
    expect(clampPitch(5)).toBe(5);
  });

  it("clamps time stretch to 0.5–1.5", () => {
    expect(clampTimeStretch(0.2)).toBe(0.5);
    expect(clampTimeStretch(2)).toBe(1.5);
  });

  it("maps tempo ratio bounds from time stretch", () => {
    expect(TEMPO_RATIO_MIN).toBeCloseTo(1 / 1.5);
    expect(TEMPO_RATIO_MAX).toBe(2);
  });

  it("formats display percent", () => {
    expect(timeStretchToDisplayPercent(1)).toBe(0);
    expect(timeStretchToDisplayPercent(0.5)).toBe(100);
    expect(timeStretchToDisplayPercent(1.5)).toBe(-33);
  });
});
