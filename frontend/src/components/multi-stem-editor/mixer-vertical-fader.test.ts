import { describe, expect, it } from "vitest";
import { faderValueToPercent } from "./mixer-vertical-fader.component";
import { MIXER_GAIN_DB_MAX, MIXER_GAIN_DB_MIN } from "../../utils/mixer-format";

describe("faderValueToPercent", () => {
  it("maps minimum dB to 0", () => {
    expect(faderValueToPercent(MIXER_GAIN_DB_MIN)).toBe(0);
  });

  it("maps maximum dB to 1", () => {
    expect(faderValueToPercent(MIXER_GAIN_DB_MAX)).toBe(1);
  });

  it("maps 0 dB to mid-scale", () => {
    const pct = faderValueToPercent(0);
    expect(pct).toBeGreaterThan(0.7);
    expect(pct).toBeLessThan(0.9);
  });

  it("maps master linear range 0–1.5", () => {
    expect(faderValueToPercent(0, 0, 1.5)).toBe(0);
    expect(faderValueToPercent(1.5, 0, 1.5)).toBe(1);
    expect(faderValueToPercent(1, 0, 1.5)).toBeCloseTo(2 / 3, 5);
  });
});
