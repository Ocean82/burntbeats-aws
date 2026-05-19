import { describe, expect, it } from "vitest";
import { getSplitProgressMessage } from "./splitProgressCopy";

describe("getSplitProgressMessage", () => {
  it("returns uploading state", () => {
    const msg = getSplitProgressMessage({
      isUploading: true,
      uploadProgress: 42,
      queuePosition: null,
      splitProgress: 0,
      elapsedSeconds: null,
      uploadDurationSec: null,
    });
    expect(msg.primary).toBe("Uploading…");
    expect(msg.secondary).toBe("42%");
  });

  it("returns queue position with ETA", () => {
    const msg = getSplitProgressMessage({
      isUploading: false,
      uploadProgress: 0,
      queuePosition: 3,
      splitProgress: 0,
      elapsedSeconds: null,
      uploadDurationSec: 300,
    });
    expect(msg.primary).toContain("Queue position 3");
    expect(msg.secondary).toMatch(/~\d+ min/);
  });

  it("returns running stage and remaining ETA", () => {
    const msg = getSplitProgressMessage({
      isUploading: false,
      uploadProgress: 0,
      queuePosition: null,
      splitProgress: 50,
      elapsedSeconds: 60,
      uploadDurationSec: 300,
      stemCount: 2,
    });
    expect(msg.primary).toBe("Separating vocals…");
    expect(msg.secondary).toMatch(/~\d+ min/);
  });

  it("uses 4-stem stage labels", () => {
    const msg = getSplitProgressMessage({
      isUploading: false,
      uploadProgress: 0,
      queuePosition: null,
      splitProgress: 50,
      elapsedSeconds: null,
      uploadDurationSec: null,
      stemCount: 4,
    });
    expect(msg.primary).toBe("Splitting drums & bass…");
  });
});
