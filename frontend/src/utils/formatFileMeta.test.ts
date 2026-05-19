import { describe, expect, it } from "vitest";
import { formatFileSize, formatUploadMeta } from "./formatFileMeta";

describe("formatFileSize", () => {
  it("formats bytes KB and MB", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(4.2 * 1024 * 1024)).toBe("4.2 MB");
  });
});

describe("formatUploadMeta", () => {
  it("joins available segments", () => {
    expect(
      formatUploadMeta({
        sizeBytes: 4.2 * 1024 * 1024,
        durationSec: 272,
        estimatedTokens: 5,
      }),
    ).toBe("4.2 MB · 4:32 · ~5 tokens");
  });

  it("shows FREE for sample mode", () => {
    expect(
      formatUploadMeta({ durationSec: 60, estimatedTokens: 1, isSample: true }),
    ).toBe("1:00 · FREE");
  });

  it("returns empty when nothing available", () => {
    expect(formatUploadMeta({})).toBe("");
  });
});
