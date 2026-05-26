import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MidiConvertPanel } from "./MidiConvertPanel";

vi.mock("./MidiResultPanel", () => ({
  MidiResultPanel: () => null,
}));

vi.mock("./MidiSourcePreview", () => ({
  MidiSourcePreview: () => null,
}));

vi.mock("../../hooks/useMidiConvert", () => ({
  useMidiConvert: () => ({
    sourceMode: "upload",
    setSourceMode: vi.fn(),
    selectedStem: null,
    setSelectedStem: vi.fn(),
    selectedLoadedStemId: null,
    setSelectedLoadedStemId: vi.fn(),
    uploadedFile: null,
    uploadName: "",
    acceptFile: vi.fn(),
    handleBrowse: vi.fn(),
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
    },
    updateSettings: vi.fn(),
    isConverting: false,
    isUploading: false,
    uploadProgress: 0,
    progress: 0,
    statusMessage: "",
    error: null,
    setError: vi.fn(),
    result: null,
    midiFileUrl: null,
    downloadMidi: vi.fn(),
    triggerConvert: vi.fn(),
    batchJobs: [],
    isBatchMode: false,
    batchProgress: { completed: 0, total: 0 },
    triggerBatchConvert: vi.fn(),
    retryBatchJob: vi.fn(),
    clearBatch: vi.fn(),
  }),
}));

vi.mock("../../store/appStore", () => ({
  useAppStore: () => ({ splitJobId: null }),
}));

describe("MidiConvertPanel", () => {
  it("renders MIDI panel and convert button", () => {
    render(<MidiConvertPanel />);
    expect(screen.getByTestId("midi-convert-panel")).toBeInTheDocument();
    expect(screen.getByText(/audio to midi/i)).toBeInTheDocument();
    expect(screen.getByTestId("midi-convert-button")).toBeInTheDocument();
  });
});
