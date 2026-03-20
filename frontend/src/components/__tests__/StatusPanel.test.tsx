import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { StatusPanel } from "../status-panel.component";
import type { StemDefinition } from "../../types";

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

describe("StatusPanel", () => {
  beforeEach(() => {
    if (!(global as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
      (global as unknown as { ResizeObserver: unknown }).ResizeObserver = vi.fn(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      }));
    }
  });

  function renderStatus(overrides: Partial<React.ComponentProps<typeof StatusPanel>> = {}) {
    const props: React.ComponentProps<typeof StatusPanel> = {
      isSplitting: false,
      hasMixStems: false,
      splitProgress: 0,
      activeStageBlurb: "Idle",
      pipelineIndex: 0,
      uploadName: "demo.wav",
      isLoadingStems: false,
      visibleStems: STEMS,
      loadedTracks: { vocals: false },
      stemBuffers: {},
      ...overrides,
    };

    return render(<StatusPanel {...props} />);
  }

  it("shows Ready state when not splitting and no stems", () => {
    renderStatus();

    const statusRegion = screen.getByRole("status");
    expect(within(statusRegion).getByText(/^Ready$/i)).toBeInTheDocument();
    expect(screen.getByText(/Split progress/i)).toBeInTheDocument();
  });

  it("shows Splitting… when isSplitting is true", () => {
    renderStatus({ isSplitting: true, splitProgress: 42 });

    expect(screen.getByText(/Splitting…/i)).toBeInTheDocument();
    expect(screen.getByText(/42%/i)).toBeInTheDocument();
  });

  it("lists visible stems with status", () => {
    renderStatus({ loadedTracks: { vocals: true } });

    expect(screen.getAllByText(/Vocals/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Ready$/i).length).toBeGreaterThan(0);
  });
});

