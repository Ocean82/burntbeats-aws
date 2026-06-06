import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNow = vi.fn(() => 100);
const mockTransport = {
  schedule: vi.fn((_cb: (time: number) => void, _time: number) => 1),
  clear: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  position: 0,
  bpm: { value: 120 },
};

vi.mock("tone", () => ({
  start: vi.fn().mockResolvedValue(undefined),
  getTransport: () => mockTransport,
  now: () => mockNow(),
  Frequency: (pitch: number) => ({
    toFrequency: () => 440 + pitch,
  }),
}));

vi.mock("./useMidiInstruments", () => ({
  useMidiInstruments: () => ({
    getSynth: vi.fn().mockResolvedValue({ triggerAttackRelease: vi.fn() }),
    releaseAll: vi.fn(),
    disposeAll: vi.fn(),
  }),
}));

import { useMidiPlayback } from "./useMidiPlayback";

const sampleNotes = [
  { pitch: 60, start: 2, duration: 10, velocity: 100 },
  { pitch: 64, start: 2.5, duration: 10, velocity: 90 },
];

describe("useMidiPlayback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNow.mockReturnValue(100);
  });

  it("starts with clip-relative time at 0", () => {
    const { result } = renderHook(() => useMidiPlayback());
    expect(result.current.currentTime).toBe(0);
  });

  it("seek while stopped updates clip-relative currentTime", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    await act(async () => {
      result.current.play(sampleNotes, { bpm: 120 });
    });

    await act(async () => {
      result.current.stop();
    });

    await act(async () => {
      result.current.seek(2.25);
    });

    expect(result.current.currentTime).toBeCloseTo(0.25, 2);
  });

  it("pause preserves position and resume continues from same point", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    await act(async () => {
      result.current.play(sampleNotes, { bpm: 120 });
    });

    mockNow.mockReturnValue(100.5);

    await act(async () => {
      result.current.pause();
    });

    expect(result.current.isPaused).toBe(true);
    expect(result.current.currentTime).toBeCloseTo(0.5, 2);

    await act(async () => {
      result.current.play(sampleNotes, { bpm: 120 });
    });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.isPaused).toBe(false);
  });

  it("play ~3s, pause, resume, then seek while stopped", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    await act(async () => {
      result.current.play(sampleNotes, { bpm: 120 });
    });

    mockNow.mockReturnValue(103);

    await act(async () => {
      result.current.pause();
    });

    expect(result.current.isPaused).toBe(true);
    expect(result.current.currentTime).toBeCloseTo(3, 1);

    await act(async () => {
      result.current.play(sampleNotes, { bpm: 120 });
    });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.currentTime).toBeCloseTo(3, 1);

    await act(async () => {
      result.current.stop();
    });

    await act(async () => {
      result.current.seek(2.5);
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBeCloseTo(0.5, 2);
  });
});
