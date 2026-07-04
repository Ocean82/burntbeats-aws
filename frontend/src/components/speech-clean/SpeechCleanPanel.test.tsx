import { render } from "@testing-library/react"
import { screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { SpeechCleanPanel } from "./SpeechCleanPanel";

vi.mock("../../hooks/useSpeechEnhance", () => ({
  useSpeechEnhance: () => ({
    inputRef: { current: null },
    uploadedFile: null,
    uploadName: "",
    isDragging: false,
    setIsDragging: vi.fn(),
    denoise: true,
    setDenoise: vi.fn(),
    batch: false,
    setBatch: vi.fn(),
    isEnhancing: false,
    isUploading: false,
    uploadProgress: 0,
    enhanceProgress: 0,
    statusMessage: null,
    error: null,
    setError: vi.fn(),
    jobId: null,
    outputUrl: null,
    handleBrowse: vi.fn(),
    acceptFile: vi.fn(),
    handleClear: vi.fn(),
    triggerEnhance: vi.fn(),
  }),
}));

describe("SpeechCleanPanel", () => {
  it("renders speech-only branding and upload zone", () => {
    render(<SpeechCleanPanel />);
    expect(screen.getByTestId("speech-clean-panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /clean up vocals/i })).toBeInTheDocument();
    expect(screen.getByText(/not for songs/i)).toBeInTheDocument();
    expect(screen.getByTestId("speech-upload-dropzone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clean speech/i })).toBeInTheDocument();
  });
});
