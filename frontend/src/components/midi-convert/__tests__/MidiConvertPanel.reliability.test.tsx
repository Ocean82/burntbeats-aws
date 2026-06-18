/**
 * MidiConvertPanel reliability wiring tests.
 *
 * Validates: Requirements 9.1, 9.3 (ErrorState wiring)
 *            Requirements 13.1, 13.2 (EmptyState wiring)
 *            Requirements 17.1, 17.2 (SuccessFlash wiring)
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MidiConvertPanel } from "../MidiConvertPanel";
import type { MidiConvertResult } from "../../../hooks/useMidiConvert";

// ---------------------------------------------------------------------------
// Mock heavy sub-components to isolate MidiConvertPanel render logic
// ---------------------------------------------------------------------------
vi.mock("../MidiSourceSelector", () => ({
  MidiSourceSelector: () => <div data-testid="midi-source-selector" />,
}));
vi.mock("../MidiSourcePreview", () => ({
  MidiSourcePreview: () => <div data-testid="midi-source-preview" />,
}));
vi.mock("../MidiConvertSettings", () => ({
  MidiConvertSettings: () => <div data-testid="midi-convert-settings" />,
}));
vi.mock("../MidiConvertProgress", () => ({
  MidiConvertProgress: () => <div data-testid="midi-convert-progress" />,
}));
vi.mock("../MidiResultPanel", () => ({
  MidiResultPanel: () => <div data-testid="midi-result-panel" />,
}));
vi.mock("../../library/MidiExportDashboard", () => ({
  MidiExportDashboard: () => <div data-testid="midi-export-dashboard" />,
}));

// ---------------------------------------------------------------------------
// Mock useAppStore — provides splitJobId and other state the panel reads.
// The component calls useAppStore((s) => s.splitJobId) as a selector.
// ---------------------------------------------------------------------------
const MOCK_APP_STATE = {
  splitJobId: null as string | null,
  splitResultStems: [],
  loadedStems: [],
  setUploadState: vi.fn(),
  setSplitError: vi.fn(),
};

vi.mock("../../../store/appStore", () => ({
  useAppStore: (selector?: (s: typeof MOCK_APP_STATE) => unknown) => {
    if (typeof selector === "function") return selector(MOCK_APP_STATE);
    return MOCK_APP_STATE;
  },
}));

// ---------------------------------------------------------------------------
// Mock authHeaders / API_BASE so fetch calls in the panel don't blow up
// ---------------------------------------------------------------------------
vi.mock("../../../api/auth", () => ({
  authHeaders: () => Promise.resolve({}),
  setJobToken: vi.fn(),
}));

vi.mock("../../../config", () => ({
  API_BASE: "",
  isAllowedMidiAudioFile: () => true,
  MIDI_ALLOWED_AUDIO_FORMATS_LABEL: "mp3, wav, flac",
  MIDI_MAX_UPLOAD_BYTES: 100 * 1024 * 1024,
}));

// ---------------------------------------------------------------------------
// Mock useMidiConvert — controllable for each test
// ---------------------------------------------------------------------------
const mockTriggerConvert = vi.fn();
const mockHandleBrowse = vi.fn();

const BASE_HOOK_RETURN = {
  sourceMode: "upload" as const,
  setSourceMode: vi.fn(),
  selectedStem: null,
  setSelectedStem: vi.fn(),
  selectedLoadedStemId: null,
  setSelectedLoadedStemId: vi.fn(),
  uploadedFile: null,
  uploadName: "",
  acceptFile: vi.fn(),
  handleBrowse: mockHandleBrowse,
  handleClear: vi.fn(),
  inputRef: { current: null },
  isDragging: false,
  setIsDragging: vi.fn(),
  splitResultStems: [],
  loadedStems: [],
  selectedSplitStemUrl: null,
  selectedLoadedStem: null,
  hasSourceSelected: false,
  settings: {
    minConfidence: 0.5,
    minNoteLengthMs: 58,
    includePitchBends: true,
    quantize: false,
    quantizeGrid: "1/16",
    quantizeBpm: 120,
    quantizeStrength: 1,
    normalizeVelocity: true,
    targetVelocity: 90,
    maxNoteLengthMs: 0,
    transpose: 0,
  },
  updateSettings: vi.fn(),
  isConverting: false,
  isUploading: false,
  uploadProgress: 0,
  progress: 0,
  statusMessage: "",
  error: null as string | null,
  setError: vi.fn(),
  result: null as MidiConvertResult | null,
  midiFileUrl: null,
  activeMidiJobId: null,
  jobToken: null,
  downloadMidi: vi.fn(),
  isDownloadingMidi: false,
  downloadError: null as string | null,
  setDownloadError: vi.fn(),
  downloadSourceLabel: null as string | null,
  triggerConvert: mockTriggerConvert,
  batchJobs: [] as import("../../../hooks/useMidiConvert").BatchJob[],
  isBatchMode: false,
  batchProgress: { completed: 0, total: 0 },
  triggerBatchConvert: vi.fn(),
  retryBatchJob: vi.fn(),
  clearBatch: vi.fn(),
  cancelBatch: vi.fn(),
  cancelConvert: vi.fn(),
};

// The module-level mock factory — returns hookState which tests can override
let hookState = { ...BASE_HOOK_RETURN };

vi.mock("../../../hooks/useMidiConvert", () => ({
  useMidiConvert: () => hookState,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetHookState(overrides: Partial<typeof BASE_HOOK_RETURN> = {}) {
  hookState = { ...BASE_HOOK_RETURN, ...overrides };
}

// ---------------------------------------------------------------------------
// Task 9.2 — ErrorState wiring
// Validates: Requirements 9.1, 9.3
// ---------------------------------------------------------------------------
describe("MidiConvertPanel — ErrorState wiring (Task 9.2)", () => {
  beforeEach(() => {
    mockTriggerConvert.mockReset();
    resetHookState({ error: "Conversion failed", setError: vi.fn() });
  });

  it("renders <ErrorState> with variant='server' when error is set", () => {
    render(<MidiConvertPanel />);
    // ErrorState renders with role="alert"
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    // The ErrorState with variant="server" uses the destructive accent class
    expect(alert.className).toMatch(/destructive/);
  });

  it("displays the error description text in <ErrorState>", () => {
    render(<MidiConvertPanel />);
    // Both the title and description contain the error string.
    // Confirm the description paragraph (muted, non-heading) is present.
    const descriptions = screen.getAllByText("Conversion failed");
    expect(descriptions.length).toBeGreaterThanOrEqual(1);
    // One of them should be the description <p> element
    const descParagraph = descriptions.find((el) => el.tagName === "P");
    expect(descParagraph).toBeInTheDocument();
  });

  it("calls triggerConvert when the retry button is clicked", () => {
    render(<MidiConvertPanel />);
    const retryButton = screen.getByRole("button", { name: /try again/i });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mockTriggerConvert).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Task 13.2 — Stage rendering (was EmptyState wiring)
// Validates: Requirements 13.1, 13.2
// ---------------------------------------------------------------------------
describe("MidiConvertPanel — Stage rendering (Task 13.2)", () => {
  beforeEach(() => {
    resetHookState({
      hasSourceSelected: false,
      result: null,
      isConverting: false,
      isBatchMode: false,
    });
  });

  it("renders source selector when no source is selected", () => {
    render(<MidiConvertPanel />);
    expect(screen.getByTestId("midi-source-selector")).toBeInTheDocument();
  });

  it("renders settings when source is selected", () => {
    resetHookState({ hasSourceSelected: true });
    render(<MidiConvertPanel />);
    expect(screen.getByTestId("midi-convert-settings")).toBeInTheDocument();
  });

  it("renders progress when isConverting is true", () => {
    resetHookState({ hasSourceSelected: true, isConverting: true });
    render(<MidiConvertPanel />);
    expect(screen.getByTestId("midi-convert-progress")).toBeInTheDocument();
  });

  it("renders editor stage when result is non-null", () => {
    const fakeResult: MidiConvertResult = {
      notesDetected: 10,
      durationSeconds: 5,
      tracks: 1,
      inferenceTimeSeconds: 0.5,
      pianoRollNotes: [],
      analysis: null,
      fileAnalysis: null,
    };
    resetHookState({ hasSourceSelected: true, result: fakeResult });
    render(<MidiConvertPanel />);
    expect(screen.getByTestId("midi-result-panel")).toBeInTheDocument();
  });

  it("hides primary convert button when a result already exists", () => {
    const fakeResult: MidiConvertResult = {
      notesDetected: 10,
      durationSeconds: 5,
      tracks: 1,
      inferenceTimeSeconds: 0.5,
      pianoRollNotes: [{ pitch: 60, start: 0, duration: 0.5, velocity: 80 }],
      analysis: null,
      fileAnalysis: null,
    };
    resetHookState({ hasSourceSelected: true, result: fakeResult });
    render(<MidiConvertPanel />);
    expect(screen.queryByTestId("midi-convert-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("midi-convert-again-button")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 17.2 — SuccessFlash wiring
// Validates: Requirements 17.1, 17.2
// ---------------------------------------------------------------------------
describe("MidiConvertPanel — SuccessFlash wiring (Task 17.2)", () => {
  const fakeResult: MidiConvertResult = {
    notesDetected: 42,
    durationSeconds: 3.2,
    tracks: 1,
    inferenceTimeSeconds: 0.8,
    pianoRollNotes: [],
    analysis: null,
    fileAnalysis: null,
  };

  it("does NOT show SuccessFlash when result is null on initial render", () => {
    resetHookState({ result: null });
    render(<MidiConvertPanel />);
    // SuccessFlash renders with role="status" only when visible
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows SuccessFlash (role=status) when result transitions from null to non-null", () => {
    // Start with result=null
    resetHookState({ result: null });
    const { rerender } = render(<MidiConvertPanel />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Transition: result becomes non-null
    hookState = { ...hookState, result: fakeResult };
    rerender(<MidiConvertPanel />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/action completed successfully/i),
    ).toBeInTheDocument();
  });

  it("hides SuccessFlash after onComplete fires", async () => {
    vi.useFakeTimers();

    // Start with result=null, then transition to non-null
    resetHookState({ result: null });
    const { rerender } = render(<MidiConvertPanel />);

    hookState = { ...hookState, result: fakeResult };
    rerender(<MidiConvertPanel />);

    const flash = screen.getByRole("status");
    expect(flash).toBeInTheDocument();

    // Advance past the 1200ms default duration — SuccessFlash calls onComplete,
    // which sets showSuccessFlash=false in the panel, which hides the element.
    vi.advanceTimersByTime(1300);
    rerender(<MidiConvertPanel />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe("MidiConvertPanel — batch cancel wiring", () => {
  const mockCancelBatch = vi.fn();

  beforeEach(() => {
    mockCancelBatch.mockReset();
    resetHookState({
      isBatchMode: true,
      batchJobs: [
        {
          stemName: "vocals",
          jobId: "job-1",
          jobToken: "token-1",
          fileUrl: null,
          status: "converting",
          result: null,
          error: null,
          progress: 40,
        },
        {
          stemName: "drums",
          jobId: null,
          jobToken: null,
          fileUrl: null,
          status: "pending",
          result: null,
          error: null,
        },
      ],
      batchProgress: { completed: 0, total: 2 },
      cancelBatch: mockCancelBatch,
    });
  });

  it("shows Cancel batch while batch is in progress and calls cancelBatch", () => {
    render(<MidiConvertPanel />);
    const cancelButton = screen.getByRole("button", { name: /cancel batch/i });
    fireEvent.click(cancelButton);
    expect(mockCancelBatch).toHaveBeenCalledOnce();
  });
});
