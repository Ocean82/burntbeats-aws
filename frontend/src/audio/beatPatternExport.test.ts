import { describe, expect, it } from "vitest";
import { patternToMidiNotes } from "./beatPatternExport";
import { DEFAULT_KIT, VELOCITY_ACCENT, VELOCITY_OFF, VELOCITY_NORMAL } from "./types";

function makePattern(steps = 16) {
  const row = Array(steps).fill(VELOCITY_OFF);
  row[0] = VELOCITY_NORMAL;
  return DEFAULT_KIT.map((_, i) => (i === 0 ? [...row] : Array(steps).fill(VELOCITY_OFF)));
}

const defaultRowStates = DEFAULT_KIT.map(() => ({
  muted: false,
  solo: false,
  volume: 1,
}));

describe("patternToMidiNotes", () => {
  it("exports audible hits with correct GM pitch", () => {
    const notes = patternToMidiNotes({
      pattern: makePattern(),
      rowStates: defaultRowStates,
      kit: DEFAULT_KIT,
      bpm: 120,
      swing: 0,
      steps: 16,
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(36);
    expect(notes[0].velocity).toBe(100);
  });

  it("skips muted rows", () => {
    const rowStates = defaultRowStates.map((r, i) =>
      i === 0 ? { ...r, muted: true } : r,
    );
    const notes = patternToMidiNotes({
      pattern: makePattern(),
      rowStates,
      kit: DEFAULT_KIT,
      bpm: 120,
      swing: 0,
      steps: 16,
    });
    expect(notes).toHaveLength(0);
  });

  it("limits free tier export to 16 steps", () => {
    const pattern = makePattern(32);
    pattern[0][20] = VELOCITY_ACCENT;
    const notes = patternToMidiNotes({
      pattern,
      rowStates: defaultRowStates,
      kit: DEFAULT_KIT,
      bpm: 120,
      swing: 0,
      steps: 32,
      canExportFullMidi: false,
    });
    expect(notes.every((n) => n.start < 16 * (60 / 120 / 4))).toBe(true);
    expect(notes.some((n) => n.velocity === 127)).toBe(false);
  });

  it("applies swing to note start times", () => {
    const pattern = makePattern();
    pattern[0][1] = VELOCITY_NORMAL;
    const straight = patternToMidiNotes({
      pattern,
      rowStates: defaultRowStates,
      kit: DEFAULT_KIT,
      bpm: 120,
      swing: 0,
      steps: 16,
    });
    const swung = patternToMidiNotes({
      pattern,
      rowStates: defaultRowStates,
      kit: DEFAULT_KIT,
      bpm: 120,
      swing: 50,
      steps: 16,
    });
    const step1Straight = straight.find((n) => n.start > 0);
    const step1Swung = swung.find((n) => n.start > straight[0].start);
    expect(step1Swung!.start).toBeGreaterThan(step1Straight!.start);
  });
});
