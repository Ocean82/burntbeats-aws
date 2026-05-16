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
});
