import { describe, expect, it } from "vitest";
import { formatDuration } from "./formatDuration";

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(32)).toBe("0:32");
    expect(formatDuration(272)).toBe("4:32");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("handles invalid input", () => {
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(-1)).toBe("0:00");
  });
});
