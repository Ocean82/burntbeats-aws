import { fireEvent, screen } from "@testing-library/dom";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KIT, VELOCITY_ACCENT, VELOCITY_OFF, VELOCITY_NORMAL } from "../../audio/types";
import type { UseBeatMakerReturn } from "../../hooks/useBeatMaker";
import type { UsePatternChainReturn } from "../../hooks/usePatternChain";
import { PatternChainView } from "./PatternChainView";

const { mockDownloadMidiBlob, mockExportNotesToMidi, mockPatternToMidiNotes } = vi.hoisted(() => ({
  mockDownloadMidiBlob: vi.fn(),
  mockExportNotesToMidi: vi.fn(() => new Blob()),
  mockPatternToMidiNotes: vi.fn(() => []),
}));

vi.mock("../../audio/beatPatternExport", () => ({
  patternToMidiNotes: mockPatternToMidiNotes,
}));

vi.mock("../../utils/midiExport", () => ({
  downloadMidiBlob: mockDownloadMidiBlob,
  exportNotesToMidi: mockExportNotesToMidi,
}));

describe("PatternChainView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the free-tier MIDI export gate to chain downloads", () => {
    render(
      <PatternChainView
        presets={[]}
        patternChain={makePatternChain()}
        beatMaker={makeBeatMaker()}
        canExportFullMidi={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /export chain as midi/i }));

    expect(mockPatternToMidiNotes).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: 32,
        canExportFullMidi: false,
      }),
    );
    expect(mockDownloadMidiBlob).toHaveBeenCalledWith(expect.any(Blob), "pattern-chain.mid");
  });
});

function makeBeatMaker(): UseBeatMakerReturn {
  return {
    kit: DEFAULT_KIT,
    rowStates: DEFAULT_KIT.map(() => ({
      muted: false,
      solo: false,
      volume: 1,
    })),
    start: vi.fn(),
    stop: vi.fn(),
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    setSwing: vi.fn(),
    setSteps: vi.fn(),
  } as unknown as UseBeatMakerReturn;
}

function makePatternChain(): UsePatternChainReturn {
  const pattern = DEFAULT_KIT.map((_, rowIndex) => {
    const row = Array(32).fill(VELOCITY_OFF);
    if (rowIndex === 0) {
      row[0] = VELOCITY_NORMAL;
      row[20] = VELOCITY_ACCENT;
    }
    return row;
  });

  return {
    chain: [
      {
        id: "chain-entry-1",
        preset: {
          name: "Two Bar Pattern",
          bpm: 120,
          swing: 0,
          steps: 32,
          pattern,
        },
        repeatCount: 1,
      },
    ],
    addToChain: vi.fn(),
    removeFromChain: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    setRepeat: vi.fn(),
    clearChain: vi.fn(),
    totalBars: 2,
    totalSteps: 32,
    exportFlattened: vi.fn(() => ({
      pattern,
      steps: 32,
      bpm: 120,
      swing: 0,
    })),
  };
}
