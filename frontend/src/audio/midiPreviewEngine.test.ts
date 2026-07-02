import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = {
  clear: vi.fn(),
  stop: vi.fn(),
  schedule: vi.fn(() => 1),
  start: vi.fn(),
  bpm: { value: 120 },
  position: 0,
};

vi.mock("tone", () => ({
  start: vi.fn().mockResolvedValue(undefined),
  getTransport: () => transport,
  PolySynth: vi.fn().mockImplementation(function PolySynth() {
    return {
      toDestination: vi.fn().mockReturnThis(),
      triggerAttackRelease: vi.fn(),
      releaseAll: vi.fn(),
      volume: { value: 0 },
    };
  }),
  Synth: vi.fn(),
  Frequency: vi.fn().mockImplementation((pitch: number) => ({
    toFrequency: () => 440 * Math.pow(2, (pitch - 69) / 12),
  })),
}));

import {
  playMidiPreviewNotes,
  stopMidiPreview,
  registerEditorTransportStopHandler,
  pausePreviewForEditor,
} from "./audioEngine";

describe("midiPreviewEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schedules preview notes on shared transport", async () => {
    await playMidiPreviewNotes(
      [{ pitch: 60, start: 0, duration: 0.5, velocity: 100 }],
      120,
    );
    expect(transport.schedule).toHaveBeenCalled();
    expect(transport.start).toHaveBeenCalled();
  });

  it("clears transport on stop after preview", async () => {
    await playMidiPreviewNotes(
      [{ pitch: 60, start: 0, duration: 0.5, velocity: 100 }],
      120,
    );
    stopMidiPreview();
    expect(transport.clear).toHaveBeenCalled();
    expect(transport.stop).toHaveBeenCalled();
  });

  it("notifies editor stop handler when preview starts", async () => {
    const stopEditor = vi.fn();
    registerEditorTransportStopHandler(stopEditor);
    await playMidiPreviewNotes(
      [{ pitch: 60, start: 0, duration: 0.5, velocity: 100 }],
      120,
    );
    expect(stopEditor).toHaveBeenCalled();
    registerEditorTransportStopHandler(null);
  });

  it("pausePreviewForEditor stops scheduled preview", async () => {
    await playMidiPreviewNotes(
      [{ pitch: 60, start: 0, duration: 0.5, velocity: 100 }],
      120,
    );
    vi.clearAllMocks();
    pausePreviewForEditor();
    expect(transport.stop).toHaveBeenCalled();
  });
});
