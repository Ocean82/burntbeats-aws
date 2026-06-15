import { describe, expect, it } from "vitest";
import { cloneMidiEffects, getMidiFxPreset, MIDI_FX_PRESETS } from "./presets";
import { previewNotesWithMidiFx } from "./previewNotesWithMidiFx";
import { defaultMidiEffects } from "./types";

describe("midiEffects presets", () => {
  it("includes named presets", () => {
    expect(MIDI_FX_PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(getMidiFxPreset("arp-up")?.name).toBe("Arp Up");
  });

  it("clones preset configs without sharing references", () => {
    const preset = getMidiFxPreset("pad-chords");
    expect(preset).toBeDefined();
    const a = cloneMidiEffects(preset!.config);
    const b = cloneMidiEffects(preset!.config);
    a.chordGenerator.strumSpeed = 0.5;
    expect(b.chordGenerator.strumSpeed).not.toBe(0.5);
  });
});

describe("previewNotesWithMidiFx", () => {
  it("returns original notes when preview has no active effects", () => {
    const notes = [{ pitch: 60, velocity: 100, start: 0, duration: 0.5 }];
    const result = previewNotesWithMidiFx(notes, defaultMidiEffects(), 120);
    expect(result).toEqual(notes);
  });

  it("returns processed notes when effects are enabled", () => {
    const notes = [{ pitch: 60, velocity: 100, start: 0, duration: 0.5 }];
    const config = defaultMidiEffects();
    config.transposer.semitones = 2;
    const result = previewNotesWithMidiFx(notes, config, 120);
    expect(result[0].pitch).toBe(62);
  });
});
