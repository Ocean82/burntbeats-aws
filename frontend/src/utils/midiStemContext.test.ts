import { describe, expect, it } from "vitest";
import { isDrumMidiContext } from "./midiStemContext";

describe("isDrumMidiContext", () => {
  it("detects drum stems and analysis flags", () => {
    expect(isDrumMidiContext("drums", null)).toBe(true);
    expect(isDrumMidiContext("vocals", { has_drums: true })).toBe(true);
    expect(isDrumMidiContext("vocals", { has_drums: false })).toBe(false);
  });
});
