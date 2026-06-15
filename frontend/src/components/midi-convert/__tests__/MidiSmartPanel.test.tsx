import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("tone", () => {
  class MockSynth {
    volume = { value: 0 };
    toDestination() {
      return this;
    }
    triggerAttackRelease() {}
  }

  return {
    start: vi.fn().mockResolvedValue(undefined),
    PolySynth: MockSynth,
    Synth: MockSynth,
  };
});

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
