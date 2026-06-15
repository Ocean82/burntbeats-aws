import { describe, expect, it } from "vitest";
import {
  readMidiResultModeFromUrl,
  syncMidiResultModeToUrl,
} from "../midiResultUrlMode";

describe("midiResultUrlMode", () => {
  it("reads valid mode query params", () => {
    expect(readMidiResultModeFromUrl("?mode=view&e2e-midi-editor=1")).toBe("view");
    expect(readMidiResultModeFromUrl("?mode=edit")).toBe("edit");
    expect(readMidiResultModeFromUrl("?mode=invalid")).toBeNull();
  });

  it("syncs mode while preserving other query params", () => {
    expect(
      syncMidiResultModeToUrl("edit", "?e2e-midi-editor=1&mode=view", "/midi"),
    ).toBe("/midi?e2e-midi-editor=1&mode=edit");
  });
});
