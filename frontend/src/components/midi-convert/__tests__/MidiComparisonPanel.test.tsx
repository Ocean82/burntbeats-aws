import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MidiNoteEvent } from "../../../hooks/useMidiConvert";
import { MidiComparisonPanel } from "../MidiComparisonPanel";

const mockPlay = vi.fn();
const mockPause = vi.fn();
const mockStop = vi.fn();
const mockSeek = vi.fn();

vi.mock("../../../hooks/useMidiPlayback", () => ({
  useMidiPlayback: () => ({
    isPlaying: false,
    currentTime: 0,
    play: mockPlay,
    pause: mockPause,
    stop: mockStop,
    seek: mockSeek,
    isSupported: true,
  }),
}));

vi.mock("tone", () => {
  class MockPlayer {
    loaded = false;
    toDestination() {
      return this;
    }
    load() {
      this.loaded = true;
      return Promise.resolve();
    }
    stop() {}
    unsync() {}
    dispose() {}
  }
  return {
    start: vi.fn().mockResolvedValue(undefined),
    Player: MockPlayer,
  };
});

vi.mock("../MidiSourcePreview", () => ({
  MidiSourcePreview: ({
    onPreviewUrlChange,
  }: {
    onPreviewUrlChange?: (url: string | null) => void;
  }) => {
    onPreviewUrlChange?.("blob:preview-test");
    return <div data-testid="midi-source-preview-mock" />;
  },
}));

vi.mock("../MidiPianoRoll", () => ({
  MidiPianoRoll: () => <div data-testid="midi-piano-roll-mock" />,
}));

const notes: MidiNoteEvent[] = [
  { pitch: 60, start: 0, duration: 1, velocity: 90 },
];

describe("MidiComparisonPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enables play both once preview audio URL is ready", async () => {
    render(
      <MidiComparisonPanel
        notes={notes}
        bpm={120}
        source={{
          sourceMode: "upload",
          uploadedFile: null,
          splitStemUrl: null,
          loadedStemUrl: null,
          midiJobId: "12121212-1212-4212-8212-121212121212",
        }}
      />,
    );

    const playBoth = await screen.findByTestId("midi-comparison-play-both");
    expect(playBoth).not.toBeDisabled();
  });
});
