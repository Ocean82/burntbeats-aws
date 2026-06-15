import { describe, expect, it } from "vitest";
import {
  buildMidiDownloadName,
  classifyMidiHttpError,
  midiErrorMessage,
} from "./midiErrors";

describe("midiErrors", () => {
  it("maps queue full responses", () => {
    expect(classifyMidiHttpError(503, "queue is full")).toContain("queue is busy");
    expect(midiErrorMessage("queue_full")).toContain("queue is busy");
  });

  it("builds meaningful download filenames", () => {
    expect(
      buildMidiDownloadName({
        stemName: "vocals",
        jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toBe("vocals-aaaaaaaa.mid");
  });

  it("uses context-specific export messages", () => {
    expect(midiErrorMessage("export_merge")).toContain("Multitrack merge failed");
    expect(midiErrorMessage("export_history", "bad payload")).toContain("bad payload");
  });
});
