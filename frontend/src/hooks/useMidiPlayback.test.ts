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
const releaseAll = vi.fn();

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
    releaseAll,
    disposeAll: vi.fn(),
  }),
}));

import { useMidiPlayback } from "./useMidiPlayback";

const sampleNotes = [
  { pitch: 60, start: 2, duration: 10, velocity: 100 },
  { pitch: 64, start: 2.5, duration: 10, velocity: 90 },
];

const updatedNotes = [
  { pitch: 72, start: 2, duration: 10, velocity: 100 },
  { pitch: 76, start: 2.5, duration: 10, velocity: 90 },
];

describe("useMidiPlayback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockNow.mockReturnValue(100);
    releaseAll.mockClear();
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

  it("refresh reschedules notes while playing", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    await act(async () => {
      result.current.play(sampleNotes, { bpm: 120 });
    });

    expect(result.current.isPlaying).toBe(true);
    releaseAll.mockClear();

    await act(async () => {
      result.current.refresh(sampleNotes, { bpm: 120 });
    });

    expect(releaseAll).toHaveBeenCalled();
  });

  it("throttles rapid refresh calls during playback", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    await act(async () => {
      result.current.play(sampleNotes, { bpm: 120 });
    });

    releaseAll.mockClear();

    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValue(1000);

    await act(async () => {
      result.current.refresh(sampleNotes, { bpm: 120 });
      nowSpy.mockReturnValue(1005);
      result.current.refresh(updatedNotes, { bpm: 120 });
      result.current.refresh(updatedNotes, { bpm: 120 });
    });

    expect(releaseAll).toHaveBeenCalledTimes(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 90));
    });

    expect(releaseAll).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it("cancels pending refresh on stop", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    await act(async () => {
      result.current.play(sampleNotes, { bpm: 120 });
    });

    releaseAll.mockClear();

    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValue(2000);

    await act(async () => {
      result.current.refresh(sampleNotes, { bpm: 120 });
      nowSpy.mockReturnValue(2005);
      result.current.refresh(updatedNotes, { bpm: 120 });
    });

    expect(releaseAll).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.stop();
      await new Promise((resolve) => setTimeout(resolve, 90));
    });

    expect(releaseAll).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it("starts synced audio when syncedPlayer is provided", async () => {
    const mockPlayer = {
      loaded: true,
      stop: vi.fn(),
      unsync: vi.fn(),
      sync: vi.fn(),
      start: vi.fn(),
    };

    const { result } = renderHook(() => useMidiPlayback());

    await act(async () => {
      result.current.play(sampleNotes, {
        bpm: 120,
        syncedPlayer: mockPlayer as unknown as import("tone").Player,
      });
    });

    expect(mockPlayer.sync).toHaveBeenCalled();
    expect(mockPlayer.start).toHaveBeenCalled();
  });
});
