import { render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

const progressionCatalog = {
  filters: { q: "", genre: "", key: "", tempo: "", tab: "progression" as const },
  entries: [
    {
      id: "midi-001",
      title: "Classic Rock Progression",
      filename: "rock.mid",
      category: {
        type: "progression",
        genre: "rock",
        key: "E major",
        time_signature: "4/4",
        complexity: "beginner",
        tempo: "moderate",
      },
      analysis: {
        estimatedTempo: 120,
        length: 16,
        track_count: 1,
        note_count: 32,
      },
      tags: ["rock"],
    },
  ],
  total: 1,
  statistics: { total_entries: 1, by_genre: { rock: 1 } },
  isLoading: false,
  error: null,
  genreOptions: ["rock"],
  keyOptions: ["E major"],
  tempoOptions: ["slow", "moderate", "fast"],
  setTab: vi.fn(),
  setSearch: vi.fn(),
  setGenre: vi.fn(),
  setKey: vi.fn(),
  setTempo: vi.fn(),
  refetch: vi.fn(),
};

const useMidiCatalogMock = vi.fn(() => progressionCatalog);

vi.mock("../../hooks/useMidiCatalog", () => ({
  useMidiCatalog: () => useMidiCatalogMock(),
  catalogFileUrl: (id: string) => `/api/catalog/midi/${id}/file`,
}));

vi.mock("../../audio/audioEngine", () => ({
  playMidiPreviewNotes: vi.fn().mockResolvedValue(undefined),
  stopMidiPreview: vi.fn(),
}));

vi.mock("../midi-convert/MidiRhythmGroovePanel", () => ({
  MidiRhythmGroovePanel: () => (
    <div data-testid="midi-rhythm-groove-panel">Groove generator</div>
  ),
}));

import { MidiCatalogPanel } from "./MidiCatalogPanel";

describe("MidiCatalogPanel", () => {
  beforeEach(() => {
    useMidiCatalogMock.mockReturnValue(progressionCatalog);
  });

  it("renders catalog panel with progression tab and entries", () => {
    render(<MidiCatalogPanel />);
    expect(screen.getByTestId("midi-catalog-panel")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /progressions/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /rhythms/i })).toBeInTheDocument();
    expect(screen.getByText("Classic Rock Progression")).toBeInTheDocument();
    expect(screen.getByText(/1 result/)).toBeInTheDocument();
  });

  it("shows live groove generator on rhythm tab", () => {
    useMidiCatalogMock.mockReturnValue({
      ...progressionCatalog,
      filters: { ...progressionCatalog.filters, tab: "rhythm" },
      entries: [],
      total: 0,
    });

    render(<MidiCatalogPanel />);
    expect(screen.getByTestId("midi-rhythm-groove-panel")).toBeInTheDocument();
  });
});
