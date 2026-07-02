import { describe, expect, it } from "vitest";
import {
  isLikelyDrumGroove,
  rhythmMidiBase64ToArrayBuffer,
  rhythmMidiBase64ToEditableNotes,
} from "./rhythmGrooveNotes";

function buildMinimalMidi(): ArrayBuffer {
  const trackEvents = [
    0x00,
    0x90,
    0x24,
    0x64,
    0x60,
    0x80,
    0x24,
    0x00,
    0x00,
    0xff,
    0x2f,
    0x00,
  ];
  const header = [
    0x4d,
    0x54,
    0x68,
    0x64,
    0x00,
    0x00,
    0x00,
    0x06,
    0x00,
    0x00,
    0x00,
    0x01,
    0x01,
    0xe0,
    0x4d,
    0x54,
    0x72,
    0x6b,
    0x00,
    0x00,
    0x00,
    trackEvents.length,
    ...trackEvents,
  ];
  return new Uint8Array(header).buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

describe("rhythmGrooveNotes", () => {
  const base64 = arrayBufferToBase64(buildMinimalMidi());

  it("converts base64 MIDI into editable notes with ids", () => {
    const notes = rhythmMidiBase64ToEditableNotes(base64);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]?.id).toBeTruthy();
    expect(notes[0]?.pitch).toBe(36);
  });

  it("round-trips base64 to ArrayBuffer", () => {
    const buffer = rhythmMidiBase64ToArrayBuffer(base64);
    expect(new Uint8Array(buffer).slice(0, 4)).toEqual(
      new Uint8Array([0x4d, 0x54, 0x68, 0x64]),
    );
  });

  it("detects likely drum grooves by pitch range", () => {
    expect(
      isLikelyDrumGroove([
        { id: "a", pitch: 36, start: 0, duration: 0.1, velocity: 100 },
        { id: "b", pitch: 42, start: 0.5, duration: 0.1, velocity: 90 },
      ]),
    ).toBe(true);
    expect(
      isLikelyDrumGroove([
        { id: "a", pitch: 60, start: 0, duration: 0.5, velocity: 80 },
      ]),
    ).toBe(false);
  });
});
