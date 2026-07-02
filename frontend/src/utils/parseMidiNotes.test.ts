import { describe, expect, it } from "vitest";
import { parseMidiBuffer } from "./parseMidiNotes";

function encodeVarLen(value: number): number[] {
  if (value < 128) return [value];
  const bytes: number[] = [];
  let v = value;
  bytes.unshift(v & 0x7f);
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function buildMinimalMidi(
  division: number,
  noteOffDelta: number = 480,
): ArrayBuffer {
  const trackEvents = [
    0x00,
    0x90,
    0x3c,
    0x64,
    ...encodeVarLen(noteOffDelta),
    0x80,
    0x3c,
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
    (division >> 8) & 0xff,
    division & 0xff,
    0x4d,
    0x54,
    0x72,
    0x6b,
    (trackEvents.length >> 24) & 0xff,
    (trackEvents.length >> 16) & 0xff,
    (trackEvents.length >> 8) & 0xff,
    trackEvents.length & 0xff,
    ...trackEvents,
  ];
  return new Uint8Array(header).buffer;
}

describe("parseMidiBuffer", () => {
  it("parses note events from a tick-based division file", () => {
    const result = parseMidiBuffer(buildMinimalMidi(480));
    expect(result.warnings).toBeUndefined();
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]?.pitch).toBe(60);
    expect(result.notes[0]?.duration).toBeCloseTo(0.5, 2);
  });

  it("parses SMPTE division using fps and ticks per frame", () => {
    // 24 fps, 80 ticks/frame → 1920 ticks/sec → 1 second note
    const result = parseMidiBuffer(buildMinimalMidi(0xe850, 1920));
    expect(result.warnings).toBeUndefined();
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]?.duration).toBeCloseTo(1, 2);
  });

  it("warns when SMPTE division is invalid", () => {
    const result = parseMidiBuffer(buildMinimalMidi(0x8000));
    expect(result.warnings?.[0]).toMatch(/Invalid SMPTE division/);
    expect(result.notes).toHaveLength(1);
  });

  it("returns empty notes for invalid buffers", () => {
    expect(parseMidiBuffer(new ArrayBuffer(4)).notes).toEqual([]);
  });
});
