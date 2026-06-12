/**
 * Unit tests for MixerWorkspace EmptyState wiring.
 *
 * Validates: Requirements 11.1, 11.2
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { MixerWorkspace } from "../mixer-workspace.component";

// ---------------------------------------------------------------------------
// Mock all context/store/hook dependencies
// ---------------------------------------------------------------------------

vi.mock("../../contexts/AudioContext", () => ({
  useAudio: () => ({
    stemBuffers: {},
    isLoadingStems: false,
    loadingError: null,
    retryLoadStems: vi.fn(),
    clearStemLoadingState: vi.fn(),
    isPlayingMix: false,
    isPlayingMixRef: { current: false },
    playingStem: null,
    loadingPreviewStemId: null,
    playheadPosition: 0,
    getPlayheadPosition: vi.fn(() => 0),
    subscribePlayheadPosition: vi.fn(() => () => {}),
    audioContextRef: { current: null },
    handlePlayMix: vi.fn(),
    handleSeekMix: vi.fn(),
    handleStopMix: vi.fn(),
    handlePreviewStem: vi.fn(),
    stopPreview: vi.fn(),
    getMasterAnalyserTimeDomainData: vi.fn(() => null),
    getMasterAnalyserTimeDomainDataLeft: vi.fn(() => null),
    getMasterAnalyserTimeDomainDataRight: vi.fn(() => null),
    getMasterAnalyserFrequencyData: vi.fn(() => null),
    getStemAnalyserTimeDomainData: vi.fn(() => null),
    getMasterRecordingStream: vi.fn(() => null),
    masterVolume: 1,
    setMasterVolume: vi.fn(),
    masterLimiterEnabled: false,
    setMasterLimiterEnabled: vi.fn(),
    applyMasterEq: vi.fn(),
    applyMasterCompressor: vi.fn(),
    loopEnabled: false,
    setLoopEnabled: vi.fn(),
  }),
}));

vi.mock("../../contexts/WorkflowContext", () => ({
  useWorkflow: () => ({
    stemStates: {},
    setStemStates: vi.fn(),
    undoStemStates: vi.fn(),
    redoStemStates: vi.fn(),
    canUndo: false,
    canRedo: false,
    resetStemStates: vi.fn(),
  }),
}));

// Control mixStems via this variable
let mockMixStems: Array<{ id: string; url: string }> = [];

vi.mock("../../hooks/workflow/useResolvedStems", () => ({
  useResolvedStems: () => ({
    mixStems: mockMixStems,
    visibleStems: mockMixStems,
  }),
}));

vi.mock("../../store/appStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) => {
    const store = {
      splitResultStems: [],
      beatGrid: null,
      setMasterLimiterEnabled: vi.fn(),
    };
    return selector(store);
  },
}));

vi.mock("../../store/uiStore", () => ({
  useUiStore: (selector: (s: unknown) => unknown) => {
    const store = { undoToast: null };
    return selector(store);
  },
}));

vi.mock("../../hooks/audio/useMixRecorder", () => ({
  useMixRecorder: () => ({
    isRecording: false,
    duration: 0,
    wavBlob: null,
    wavFilename: null,
    error: null,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    reset: vi.fn(),
  }),
}));

// Lazy-loaded MixerPanel — replace with a simple stub so Suspense resolves
vi.mock("../../components/mixer-panel.component", () => ({
  MixerPanel: () => <div data-testid="mixer-panel">MixerPanel</div>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMixerWorkspaceProps(
  overrides: Partial<React.ComponentProps<typeof MixerWorkspace>> = {},
): React.ComponentProps<typeof MixerWorkspace> {
  return {
    mixerSectionRef: createRef(),
    onPointerDownMixer: vi.fn(),
    guidanceTarget: null,
    guidanceRingClass: "",
    onResetLevels: vi.fn(),
    stemWaveforms: {},
    activeStemId: undefined,
    onActiveStemChange: vi.fn(),
    onStemStateChange: vi.fn(),
    onPreviewStem: vi.fn(),
    onExport: vi.fn(),
    isExporting: false,
    isComparingExport: false,
    exportCompareSummary: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MixerWorkspace EmptyState wiring", () => {
  beforeEach(() => {
    // Reset to empty defaults before each test
    mockMixStems = [];
  });

  it("renders EmptyState with 'No stems loaded' when mixStems is empty and not loading", () => {
    mockMixStems = [];

    render(<MixerWorkspace {...makeMixerWorkspaceProps()} />);

    expect(screen.getByText("No stems loaded")).toBeInTheDocument();
  });

  it("does NOT render EmptyState when mixStems has entries", () => {
    mockMixStems = [{ id: "vocals", url: "blob:vocals" }];

    render(<MixerWorkspace {...makeMixerWorkspaceProps()} />);

    expect(screen.queryByText("No stems loaded")).not.toBeInTheDocument();
  });
});
