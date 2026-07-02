import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MidiRhythmGroovePanel } from "./MidiRhythmGroovePanel";

vi.mock("../../api/midiRhythm", () => ({
  fetchRhythmStylesResilient: vi.fn().mockResolvedValue({
    styles: [{ id: "rock-8", label: "Rock 8th", description: "Driving rock groove" }],
    source: "online",
  }),
  generateRhythmGroove: vi.fn().mockResolvedValue({
    notes: [{ id: "n1", pitch: 36, start: 0, duration: 0.1, velocity: 100 }],
    filename: "rock-8.mid",
    source: "online",
  }),
}));

vi.mock("../../audio/audioEngine", () => ({
  playMidiPreviewNotes: vi.fn().mockResolvedValue(undefined),
  stopMidiPreview: vi.fn(),
}));

import { generateRhythmGroove } from "../../api/midiRhythm";

describe("MidiRhythmGroovePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads styles and inserts groove into editor", async () => {
    const onInsertNotes = vi.fn();
    render(<MidiRhythmGroovePanel bpm={128} onInsertNotes={onInsertNotes} />);

    await waitFor(() => {
      expect(screen.getByTestId("midi-rhythm-groove-panel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("midi-rhythm-insert-groove"));

    await waitFor(() => {
      expect(generateRhythmGroove).toHaveBeenCalledWith({
        style: "rock-8",
        bars: 4,
        tempo: 128,
        energy: 0.7,
      });
      expect(onInsertNotes).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ pitch: 36 })]),
        "Rock 8th",
        "new-track",
      );
    });
  });

  it("shows catalog preview and download actions", async () => {
    render(<MidiRhythmGroovePanel showCatalogActions bpm={120} />);

    await waitFor(() => {
      expect(screen.getByTestId("midi-rhythm-preview-groove")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("midi-rhythm-preview-groove"));

    await waitFor(() => {
      expect(generateRhythmGroove).toHaveBeenCalled();
    });

    expect(screen.getByTestId("midi-rhythm-download-groove")).toBeInTheDocument();
  });

  it("shows offline banner when styles source is offline", async () => {
    const { fetchRhythmStylesResilient } = await import("../../api/midiRhythm");
    vi.mocked(fetchRhythmStylesResilient).mockResolvedValueOnce({
      styles: [{ id: "rock", label: "Rock" }],
      source: "offline",
    });

    render(<MidiRhythmGroovePanel bpm={120} />);

    await waitFor(() => {
      expect(screen.getByTestId("midi-rhythm-source-banner")).toBeInTheDocument();
    });
  });
});
