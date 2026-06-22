import { render } from "@testing-library/react"
import { screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("tone", () => ({
  start: vi.fn().mockResolvedValue(undefined),
  getTransport: () => ({
    clear: vi.fn(),
    stop: vi.fn(),
    schedule: vi.fn(() => 1),
    start: vi.fn(),
    bpm: { value: 120 },
  }),
  PolySynth: vi.fn().mockImplementation(() => ({
    toDestination: vi.fn().mockReturnThis(),
    triggerAttackRelease: vi.fn(),
    releaseAll: vi.fn(),
    volume: { value: 0 },
  })),
  Synth: vi.fn(),
  Frequency: vi.fn().mockImplementation((pitch: number) => ({
    toFrequency: () => 440 * Math.pow(2, (pitch - 69) / 12),
  })),
}));

import { MidiCatalogPanel } from "./MidiCatalogPanel";

vi.mock("../../hooks/useMidiCatalog", () => ({
  useMidiCatalog: () => ({
    filters: { q: "", genre: "", key: "", tempo: "", tab: "progression" },
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
  }),
  catalogFileUrl: (id: string) => `/api/catalog/midi/${id}/file`,
}));

describe("MidiCatalogPanel", () => {
  it("renders catalog panel with progression tab and entries", () => {
    render(<MidiCatalogPanel />);
    expect(screen.getByTestId("midi-catalog-panel")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /progressions/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /rhythms/i })).toBeInTheDocument();
    expect(screen.getByText("Classic Rock Progression")).toBeInTheDocument();
    expect(screen.getByText(/1 result/)).toBeInTheDocument();
  });
});
