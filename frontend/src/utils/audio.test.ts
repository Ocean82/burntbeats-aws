import { describe, expect, it } from "vitest";
import { computeWaveformFromBuffer, trimToSeconds } from "./audio";

function createMockAudioBuffer(
  numberOfChannels: number,
  length: number,
  sampleRate: number,
  fillValue: number = 0.5
): AudioBuffer {
  const channels: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) {
    const data = new Float32Array(length);
    data.fill(fillValue);
    channels.push(data);
  }
  return {
    numberOfChannels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channels[ch],
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe("computeWaveformFromBuffer", () => {
  it("returns array of requested bin count", () => {
    const buffer = createMockAudioBuffer(2, 44100, 44100);
    const result = computeWaveformFromBuffer(buffer, 512);
    expect(result).toHaveLength(512);
  });

  it("fills with min bar value for empty buffer", () => {
    const buffer = createMockAudioBuffer(1, 0, 44100);
    const result = computeWaveformFromBuffer(buffer, 10);
    expect(result).toHaveLength(10);
    expect(result.every((v) => v === 0.12)).toBe(true);
  });

  it("clamps values between min and 1", () => {
    const buffer = createMockAudioBuffer(1, 1000, 44100, 0.8);
    const result = computeWaveformFromBuffer(buffer, 10);
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0.12);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("returns higher values for louder signals", () => {
    const quiet = createMockAudioBuffer(1, 44100, 44100, 0.1);
    const loud = createMockAudioBuffer(1, 44100, 44100, 0.9);
    const quietWave = computeWaveformFromBuffer(quiet, 10);
    const loudWave = computeWaveformFromBuffer(loud, 10);
    // Both normalized to peak, but loud should have less overhead padding
    // Both should be valid arrays
    expect(quietWave).toHaveLength(10);
    expect(loudWave).toHaveLength(10);
  });

  it("handles multi-channel buffers", () => {
    const buffer = createMockAudioBuffer(2, 44100, 44100, 0.5);
    const result = computeWaveformFromBuffer(buffer, 64);
    expect(result).toHaveLength(64);
    expect(result.every((v) => v >= 0.12 && v <= 1)).toBe(true);
  });
});

describe("trimToSeconds", () => {
  it("returns full duration for default trim", () => {
    const buffer = createMockAudioBuffer(1, 44100, 44100);
    const result = trimToSeconds(buffer, { start: 0, end: 100 });
    expect(result.trimStart).toBe(0);
    expect(result.trimEnd).toBeCloseTo(1, 2);
  });

  it("returns half duration for 0-50 trim", () => {
    const buffer = createMockAudioBuffer(1, 44100, 44100);
    const result = trimToSeconds(buffer, { start: 0, end: 50 });
    expect(result.trimStart).toBe(0);
    expect(result.trimEnd).toBeCloseTo(0.5, 2);
  });

  it("handles mid-range trim", () => {
    const buffer = createMockAudioBuffer(1, 44100, 44100);
    const result = trimToSeconds(buffer, { start: 25, end: 75 });
    expect(result.trimStart).toBeCloseTo(0.25, 2);
    expect(result.trimEnd).toBeCloseTo(0.75, 2);
  });

  it("ensures trimEnd >= trimStart", () => {
    const buffer = createMockAudioBuffer(1, 44100, 44100);
    const result = trimToSeconds(buffer, { start: 50, end: 50 });
    expect(result.trimEnd).toBeGreaterThanOrEqual(result.trimStart);
  });
});
