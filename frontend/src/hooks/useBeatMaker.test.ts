import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBeatMaker } from "./useBeatMaker";
import { VELOCITY_NORMAL, VELOCITY_OFF } from "../audio/types";

vi.mock("../audio/drumSynth", () => ({
  playDrumVoice: vi.fn(),
}));

import { playDrumVoice } from "../audio/drumSynth";

const mockPlayDrumVoice = playDrumVoice as ReturnType<typeof vi.fn>;

let mockCurrentTime = 0;

function setupMockAudioContext() {
  mockCurrentTime = 0;
  const noop = () => {};

  class TestAudioContext {
    sampleRate = 44100;
    destination = { connect: noop };
    state: AudioContextState = "running";

    get currentTime() {
      return mockCurrentTime;
    }

    resume() {
      return Promise.resolve();
    }

    close() {
      return Promise.resolve();
    }
  }

  vi.stubGlobal("AudioContext", TestAudioContext);
}

function advanceScheduler(ms: number) {
  const ticks = Math.ceil(ms / 25);
  for (let i = 0; i < ticks; i++) {
    mockCurrentTime += 0.025;
    act(() => {
      vi.advanceTimersByTime(25);
    });
  }
}

function patternWithHitOnFirstStep(result: ReturnType<typeof useBeatMaker>) {
  const next = result.pattern.map((row, ri) =>
    row.map((vel, ci) => (ri === 0 && ci === 0 ? VELOCITY_NORMAL : vel)),
  );
  result.setPattern(next);
}

describe("useBeatMaker setRowVolume", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMockAudioContext();
    mockPlayDrumVoice.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clamps row volume between 0 and 1", () => {
    const { result } = renderHook(() => useBeatMaker());

    act(() => {
      result.current.setRowVolume(0, 1.5);
    });
    expect(result.current.rowStates[0].volume).toBe(1);

    act(() => {
      result.current.setRowVolume(0, -0.25);
    });
    expect(result.current.rowStates[0].volume).toBe(0);
  });

  it("scales scheduled velocity by row volume during playback", () => {
    const { result } = renderHook(() => useBeatMaker());

    act(() => {
      patternWithHitOnFirstStep(result.current);
      result.current.setRowVolume(0, 0.5);
      result.current.start();
    });

    advanceScheduler(100);

    expect(mockPlayDrumVoice).toHaveBeenCalled();
    const hitCall = mockPlayDrumVoice.mock.calls.find((call) => call[3] > 0);
    expect(hitCall).toBeDefined();
    expect(hitCall![3]).toBe(Math.round(VELOCITY_NORMAL * 0.5));

    act(() => {
      result.current.stop();
    });
  });

  it("uses default row volume of 0.8 when not changed", () => {
    const { result } = renderHook(() => useBeatMaker());

    act(() => {
      patternWithHitOnFirstStep(result.current);
      result.current.start();
    });

    advanceScheduler(100);

    const hitCall = mockPlayDrumVoice.mock.calls.find((call) => call[3] > 0);
    expect(hitCall).toBeDefined();
    expect(hitCall![3]).toBe(Math.round(VELOCITY_NORMAL * 0.8));

    act(() => {
      result.current.stop();
    });
  });

  it("does not schedule hits for muted rows regardless of volume", () => {
    const { result } = renderHook(() => useBeatMaker());

    act(() => {
      patternWithHitOnFirstStep(result.current);
      result.current.setRowVolume(0, 1);
      result.current.toggleMute(0);
      result.current.start();
    });

    advanceScheduler(100);

    const hitCalls = mockPlayDrumVoice.mock.calls.filter((call) => call[3] > VELOCITY_OFF);
    expect(hitCalls).toHaveLength(0);

    act(() => {
      result.current.stop();
    });
  });
});
