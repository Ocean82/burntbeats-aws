/**
 * SpeechCleanPanel reliability wiring tests.
 *
 * Task 8.2  — Validates: Requirements 8.1, 8.3
 * Task 14.2 — Validates: Requirements 14.1, 14.2
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpeechCleanPanel } from "../SpeechCleanPanel";

// ---------------------------------------------------------------------------
// Top-level mock — vi.mock is hoisted, so we control return values via
// a mutable `mockOverrides` object that each test can patch before render.
// ---------------------------------------------------------------------------

const mockTriggerEnhance = vi.fn();
const mockSetError = vi.fn();

interface HookOverrides {
  error: string | null;
  uploadedFile: File | null;
  outputUrl: string | null;
  isEnhancing: boolean;
  triggerEnhance: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
}

let mockOverrides: HookOverrides = {
  error: null,
  uploadedFile: null,
  outputUrl: null,
  isEnhancing: false,
  triggerEnhance: mockTriggerEnhance,
  setError: mockSetError,
};

vi.mock("../../../hooks/useSpeechEnhance", () => ({
  useSpeechEnhance: () => ({
    inputRef: { current: null },
    uploadedFile: mockOverrides.uploadedFile,
    uploadName: "",
    isDragging: false,
    setIsDragging: vi.fn(),
    denoise: true,
    setDenoise: vi.fn(),
    batch: false,
    setBatch: vi.fn(),
    isEnhancing: mockOverrides.isEnhancing,
    isUploading: false,
    uploadProgress: 0,
    enhanceProgress: 0,
    statusMessage: null,
    error: mockOverrides.error,
    setError: mockOverrides.setError,
    jobId: null,
    outputUrl: mockOverrides.outputUrl,
    handleBrowse: vi.fn(),
    acceptFile: vi.fn(),
    handleClear: vi.fn(),
    triggerEnhance: mockOverrides.triggerEnhance,
  }),
}));

// ---------------------------------------------------------------------------
// Task 8.2 — ErrorState wiring
// Validates: Requirements 8.1, 8.3
// ---------------------------------------------------------------------------

describe("SpeechCleanPanel — ErrorState wiring (task 8.2)", () => {
  it("renders ErrorState when the hook returns an error string", () => {
    mockOverrides = {
      ...mockOverrides,
      error: "Service error",
      uploadedFile: null,
      outputUrl: null,
      isEnhancing: false,
    };

    render(<SpeechCleanPanel />);

    // ErrorState renders role="alert" per its aria contract
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Description text from the hook error
    expect(screen.getByText("Service error")).toBeInTheDocument();
    // Title set by the component
    expect(screen.getByText("Enhancement failed")).toBeInTheDocument();
  });

  it("calls triggerEnhance when the 'Try again' retry button is clicked", () => {
    const triggerEnhance = vi.fn();
    mockOverrides = {
      ...mockOverrides,
      error: "Service error",
      triggerEnhance,
    };

    render(<SpeechCleanPanel />);

    // ErrorState renders an onRetry button labelled "Try again"
    const retryButton = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryButton);

    expect(triggerEnhance).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Task 14.2 — EmptyState wiring
// Validates: Requirements 14.1, 14.2
// ---------------------------------------------------------------------------

describe("SpeechCleanPanel — EmptyState wiring (task 14.2)", () => {
  it("renders EmptyState with 'No enhancements yet' when there is no file, no output, and not enhancing", () => {
    mockOverrides = {
      ...mockOverrides,
      error: null,
      uploadedFile: null,
      outputUrl: null,
      isEnhancing: false,
    };

    render(<SpeechCleanPanel />);

    expect(screen.getByText("No enhancements yet")).toBeInTheDocument();
  });
});
