import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MixerPanel } from "../mixer-panel.component";
import type { StemDefinition } from "../../types";
import { defaultMixer } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";

const STEMS: StemDefinition[] = [
  {
    id: "vocals",
    label: "Vocals",
    subtitle: "Lead vocal",
    flavor: "",
    glow: "#ff845c",
    glowSoft: "rgba(255,132,92,0.36)",
    waveform: [],
  },
];

const STEM_STATE: Record<string, StemEditorState> = {
  vocals: {
    trim: { start: 0, end: 100 },
    mixer: { ...defaultMixer },
    rate: 1,
    pitchSemitones: 0,
    timeStretch: 1,
    muted: false,
    soloed: false,
  },
};

describe("MixerPanel", () => {
  beforeEach(() => {
    if (!(global as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
      (global as unknown as { ResizeObserver: unknown }).ResizeObserver = vi.fn(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      }));
    }
  });

  function renderMixer(overrides: Partial<React.ComponentProps<typeof MixerPanel>> = {}) {
    const onPlayStop = vi.fn();
    const onStopMix = vi.fn();
    const onExport = vi.fn();
    const onResetLevels = vi.fn();
    const onActiveStemChange = vi.fn();
    const onStemStateChange = vi.fn();
    const onPreviewStem = vi.fn();
    const getPlayheadPosition = vi.fn(() => 0);
    const subscribePlayheadPosition = vi.fn(() => () => {});

    const props: React.ComponentProps<typeof MixerPanel> = {
      mixStemCount: STEMS.length,
      isPlayingMix: false,
      onPlayStop,
      onStopMix,
      isExporting: false,
      onExport,
      onResetLevels,
      hasStemBuffers: true,
      stems: STEMS,
      waveforms: { vocals: [] },
      durations: { vocals: 120 },
      stemStates: STEM_STATE,
      getPlayheadPosition,
      subscribePlayheadPosition,
      isLoadingStems: false,
      activeStemId: "vocals",
      onActiveStemChange,
      onStemStateChange,
      onPreviewStem,
      playingStemId: null,
      getMasterAnalyserTimeDomainData: () => null,
      getMasterAnalyserFrequencyData: () => null,
      ...overrides,
    };

    return {
      ...render(<MixerPanel {...props} />),
      handlers: { onPlayStop, onStopMix, onExport, onResetLevels, onActiveStemChange, onStemStateChange, onPreviewStem },
    };
  }

  it("renders mixer header and controls when stems exist", () => {
    renderMixer();

    expect(screen.getByText(/Timeline · Mix · Export/i)).toBeInTheDocument();
    expect(screen.getByText(/Master output/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Play mix/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
  });

  it("calls onPlayStop when Play mix is clicked", () => {
    const { handlers } = renderMixer();

    fireEvent.click(screen.getAllByRole("button", { name: /Play mix/i })[0]);
    expect(handlers.onPlayStop).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when mixStemCount is 0", () => {
    renderMixer({ mixStemCount: 0 });

    expect(screen.getByText(/Split a track or load stems to start mixing and exporting/i)).toBeInTheDocument();
  });
});

