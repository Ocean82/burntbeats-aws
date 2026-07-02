import { render } from "@testing-library/react"
import { fireEvent, screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("tone", () => {
  class MockSynth {
    volume = { value: 0 };
    toDestination() {
      return this;
    }
    triggerAttackRelease() {}
    releaseAll() {}
  }

  return {
    start: vi.fn().mockResolvedValue(undefined),
    getTransport: () => ({
      clear: vi.fn(),
      stop: vi.fn(),
      schedule: vi.fn(() => 1),
      start: vi.fn(),
      bpm: { value: 120 },
      position: 0,
    }),
    PolySynth: MockSynth,
    Synth: MockSynth,
    Frequency: vi.fn().mockImplementation((pitch: number) => ({
      toFrequency: () => 440 * Math.pow(2, (pitch - 69) / 12),
    })),
  };
});

vi.mock("../../../audio/audioEngine", () => ({
  previewChordMidiNotes: vi.fn().mockResolvedValue(undefined),
}));

import { MidiSmartPanel } from "../MidiSmartPanel";

describe("MidiSmartPanel", () => {
  it("previews on click without inserting", () => {
    const onInsertChord = vi.fn();

    render(<MidiSmartPanel onInsertChord={onInsertChord} />);

    const chordButton = screen.getByTestId("smart-chord-C maj");
    fireEvent.click(chordButton);

    expect(onInsertChord).not.toHaveBeenCalled();
  });

  it("inserts on double-click", () => {
    const onInsertChord = vi.fn();

    render(<MidiSmartPanel onInsertChord={onInsertChord} />);

    const chordButton = screen.getByTestId("smart-chord-C maj");
    fireEvent.doubleClick(chordButton);

    expect(onInsertChord).toHaveBeenCalled();
  });

  it("inserts via plus affordance", () => {
    const onInsertChord = vi.fn();

    render(<MidiSmartPanel onInsertChord={onInsertChord} />);

    fireEvent.click(screen.getByLabelText("Insert C maj chord"));

    expect(onInsertChord).toHaveBeenCalled();
  });
});
