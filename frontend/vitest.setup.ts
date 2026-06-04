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

  class MockAudioContext {
    sampleRate: number;
    destination = { connect: noop };
    state: AudioContextState = "running";

    constructor(...args: unknown[]) {
      const rate = args.length >= 3 ? args[2] : 44100;
      this.sampleRate = typeof rate === "number" ? rate : 44100;
    }

    createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
      const channel = new Float32Array(length);
      return {
        length,
        duration: length / sampleRate,
        numberOfChannels,
        sampleRate,
        getChannelData: () => channel,
        copyFromChannel: noop,
        copyToChannel: noop,
      } as AudioBuffer;
    }

    createBufferSource() {
      return {
        connect: noop,
        disconnect: noop,
        start: noop,
        stop: noop,
        buffer: null as AudioBuffer | null,
        playbackRate: { value: 1 },
      };
    }

    createGain() {
      return {
        gain: { value: 1, setValueAtTime: noop },
        connect: noop,
        disconnect: noop,
        channelCount: 2,
        channelCountMode: "max",
      };
    }

    createStereoPanner() {
      return { pan: { value: 0 }, connect: noop, disconnect: noop };
    }

    createDynamicsCompressor() {
      return { connect: noop, disconnect: noop };
    }

    createBiquadFilter() {
      return {
        type: "lowshelf",
        frequency: { value: 200 },
        gain: { value: 0 },
        Q: { value: 1 },
        connect: noop,
        disconnect: noop,
      };
    }

    createDelay() {
      return {
        delayTime: { value: 0 },
        connect: noop,
        disconnect: noop,
      };
    }

    createConvolver() {
      return { buffer: null, connect: noop, disconnect: noop };
    }

    createChannelSplitter() {
      return { connect: noop, disconnect: noop };
    }

    createChannelMerger() {
      return { connect: noop, disconnect: noop };
    }

    createWaveShaper() {
      return {
        curve: new Float32Array(2),
        oversample: "none",
        connect: noop,
        disconnect: noop,
      };
    }

    decodeAudioData() {
      return Promise.resolve(this.createBuffer(2, 128, this.sampleRate));
    }

    async startRendering() {
      return this.createBuffer(2, 128, this.sampleRate);
    }

    close() {
      return Promise.resolve();
    }
  }

  const MockCtor = MockAudioContext as unknown as typeof AudioContext;
  window.AudioContext = window.AudioContext ?? MockCtor;
  (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
    window.AudioContext;
  window.OfflineAudioContext =
    window.OfflineAudioContext ?? (MockAudioContext as unknown as typeof OfflineAudioContext);
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
