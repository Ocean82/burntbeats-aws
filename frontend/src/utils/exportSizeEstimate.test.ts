import { describe, expect, it } from "vitest";
import {
  estimateExportBytes,
  formatExportBytes,
  getExportSizeWarningLevel,
} from "./exportSizeEstimate";

describe("estimateExportBytes", () => {
  it("estimates WAV master for 5 minutes", () => {
    const bytes = estimateExportBytes({
      format: "wav",
      target: "master",
      stemCount: 4,
      durationSec: 300,
    });
    // 44100 * 2 * 2 * 300 ≈ 52.9 MB
    expect(bytes).toBeGreaterThan(50 * 1024 * 1024);
    expect(bytes).toBeLessThan(60 * 1024 * 1024);
  });

  it("multiplies for all stems WAV", () => {
    const master = estimateExportBytes({
      format: "wav",
      target: "master",
      stemCount: 4,
      durationSec: 300,
    });
    const all = estimateExportBytes({
      format: "wav",
      target: "all",
      stemCount: 4,
      durationSec: 300,
    });
    expect(all).toBeGreaterThan(master * 4);
  });

  it("MP3 is smaller than WAV", () => {
    const wav = estimateExportBytes({
      format: "wav",
      target: "master",
      stemCount: 2,
      durationSec: 300,
    });
    const mp3 = estimateExportBytes({
      format: "mp3",
      target: "master",
      stemCount: 2,
      durationSec: 300,
    });
    expect(mp3).toBeLessThan(wav);
  });
});

describe("formatExportBytes", () => {
  it("formats MB", () => {
    expect(formatExportBytes(52 * 1024 * 1024)).toBe("~52 MB");
  });
});

describe("getExportSizeWarningLevel", () => {
  it("returns warning tiers", () => {
    expect(getExportSizeWarningLevel(30 * 1024 * 1024)).toBe("none");
    expect(getExportSizeWarningLevel(60 * 1024 * 1024)).toBe("medium");
    expect(getExportSizeWarningLevel(150 * 1024 * 1024)).toBe("large");
  });
});
