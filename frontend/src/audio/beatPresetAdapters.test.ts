/**
 * Unit tests for beatPresetAdapters.
 */
import { describe, expect, it } from "vitest";
import { getValidPresets } from "./genrePresets";
import { genrePresetToBeatPreset } from "./beatPresetAdapters";

describe("genrePresetToBeatPreset", () => {
  it("maps catalog fields to BeatPreset shape", () => {
    const source = getValidPresets()[0];
    const beat = genrePresetToBeatPreset(source);

    expect(beat.name).toBe(source.name);
    expect(beat.pattern).toBe(source.pattern);
    expect(beat.bpm).toBe(source.tempo);
    expect(beat.swing).toBe(source.swing);
    expect(beat.steps).toBe(source.steps);
  });
});
