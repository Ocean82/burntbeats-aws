import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

/** Tone.js pulls a real AudioContext at import time — stub for unit tests. */
vi.mock("tone", () => {
  const noop = () => {};
  const transport = {
    bpm: { value: 120 },
    schedule: () => 1,
    clear: noop,
    stop: noop,
    position: 0,
    start: noop,
  };
  return {
    start: () => Promise.resolve(),
    getTransport: () => transport,
    Frequency: (val: number, unit: string) => ({
      toFrequency: () => (unit === "midi" ? 440 * Math.pow(2, (val - 69) / 12) : val),
    }),
    Synth: vi.fn(),
    PolySynth: vi.fn(() => ({
      toDestination: () => ({
        volume: { value: 0 },
        triggerAttackRelease: noop,
        releaseAll: noop,
      }),
      volume: { value: 0 },
      triggerAttackRelease: noop,
      releaseAll: noop,
    })),
    MembraneSynth: vi.fn(() => ({
      toDestination: () => ({ triggerAttackRelease: noop }),
      triggerAttackRelease: noop,
    })),
    NoiseSynth: vi.fn(() => ({
      toDestination: () => ({ triggerAttackRelease: noop }),
      triggerAttackRelease: noop,
    })),
  };
});

// Minimal mocks for Web Audio / browser APIs used by App
if (typeof window !== "undefined") {
  const noop = () => {};
  const mockContext = {
    createBuffer: () => ({}),
    createBufferSource: () => ({
      connect: noop,
      start: noop,
      stop: noop,
      buffer: null,
    }),
    createGain: () => ({ gain: { value: 1 }, connect: noop }),
    createStereoPanner: () => ({ pan: { value: 0 }, connect: noop }),
    destination: {},
    sampleRate: 44100,
    decodeAudioData: () => Promise.resolve(null),
    close: () => Promise.resolve(),
    state: "closed",
  };
  window.AudioContext = (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ?? (() => mockContext);
  (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext = window.AudioContext;
  window.OfflineAudioContext = window.OfflineAudioContext ?? (() => mockContext);
  if (typeof HTMLMediaElement !== "undefined") {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = noop;
  }
  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = (() => ({
      setTransform: noop,
      clearRect: noop,
      beginPath: noop,
      roundRect: noop,
      fill: noop,
      fillRect: noop,
      globalAlpha: 1,
      fillStyle: "#000",
      strokeStyle: "#000",
      stroke: noop,
      shadowBlur: 0,
      shadowColor: "",
      scale: noop,
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  }
  if (typeof globalThis.requestAnimationFrame === "undefined") {
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(performance.now());
      return 1;
    };
    globalThis.cancelAnimationFrame = noop;
  }
}
