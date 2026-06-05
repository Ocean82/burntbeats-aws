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

  it("returns jobs ahead when queued", () => {
    const msg = getSplitProgressMessage({
      isUploading: false,
      uploadProgress: 0,
      queuePosition: 3,
      jobsAhead: 2,
      splitProgress: 0,
      elapsedSeconds: null,
      uploadDurationSec: 300,
    });
    expect(msg.primary).toBe("2 jobs ahead — waiting to start…");
    expect(msg.secondary).toBe("Queue position 3");
  });

  it("returns next in queue when position is 1", () => {
    const msg = getSplitProgressMessage({
      isUploading: false,
      uploadProgress: 0,
      queuePosition: 1,
      jobsAhead: 0,
      splitProgress: 0,
      elapsedSeconds: null,
      uploadDurationSec: null,
    });
    expect(msg.primary).toBe("Next in queue — waiting to start…");
    expect(msg.secondary).toBeUndefined();
  });

  it("returns running stage without a guessed remaining ETA", () => {
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
    expect(msg.secondary).toBeUndefined();
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

  it("uses intent fallback for extract vocals when no backend label", () => {
    const msg = getSplitProgressMessage({
      isUploading: false,
      uploadProgress: 0,
      queuePosition: null,
      splitProgress: 50,
      elapsedSeconds: null,
      uploadDurationSec: null,
      splitIntent: { task: "extract", targets: ["vocals"], quality: "fast" },
    });
    expect(msg.primary).toBe("Extracting vocals…");
  });

  it("prefers backend-reported stage labels when available", () => {
    const msg = getSplitProgressMessage({
      isUploading: false,
      uploadProgress: 0,
      queuePosition: null,
      splitProgress: 85,
      elapsedSeconds: 120,
      uploadDurationSec: null,
      stemCount: 4,
      progressStageLabel: "Splitting drums, bass & other…",
    });
    expect(msg.primary).toBe("Splitting drums, bass & other…");
    expect(msg.secondary).toBeUndefined();
  });
});
