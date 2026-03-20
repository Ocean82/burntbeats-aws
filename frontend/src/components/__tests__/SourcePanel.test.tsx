import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourcePanel } from "../source-panel.component";
import type { SplitQuality } from "../../api";

function renderSourcePanel(overrides: Partial<React.ComponentProps<typeof SourcePanel>> = {}) {
  const onSourceModeChange = vi.fn();
  const onSetIsDragging = vi.fn();
  const onLoadStems = vi.fn();
  const onRemoveLoadedStem = vi.fn();
  const onBrowseUpload = vi.fn();
  const onClearUpload = vi.fn();
  const onDropUpload = vi.fn();
  const onUploadFileInput = vi.fn();
  const onQualityChange = vi.fn<(q: SplitQuality) => void>();
  const onToggleStem = vi.fn();
  const onDismissError = vi.fn();
  const onSplit = vi.fn();
  const onAddToQueue = vi.fn();
  const loadStemsInputRef = { current: null } as React.MutableRefObject<HTMLInputElement | null>;
  const inputRef = { current: null } as React.MutableRefObject<HTMLInputElement | null>;

  const defaultProps: React.ComponentProps<typeof SourcePanel> = {
    sourceMode: "split",
    onSourceModeChange,
    uploadName: "demo.wav",
    loadedStemCount: 0,
    isDragging: false,
    onSetIsDragging,
    loadStemsInputRef,
    onLoadStems,
    loadedStems: [],
    onRemoveLoadedStem,
    uploadedFile: null,
    onBrowseUpload,
    onClearUpload,
    onDropUpload,
    inputRef,
    onUploadFileInput,
    quality: "quality",
    onQualityChange,
    splitResultStemsLength: 0,
    isExpanding: false,
    onExpand: vi.fn(),
    selectedStems: {
      vocals: true,
      drums: true,
      bass: true,
      melody: true,
      instrumental: true,
      other: true,
    },
    onToggleStem,
    splitError: null,
    onDismissError,
    onSplit,
    isSplitting: false,
    onAddToQueue,
    ...overrides,
  };

  return {
    ...render(<SourcePanel {...defaultProps} />),
    handlers: {
      onSourceModeChange,
      onSetIsDragging,
      onLoadStems,
      onRemoveLoadedStem,
      onBrowseUpload,
      onClearUpload,
      onDropUpload,
      onUploadFileInput,
      onQualityChange,
      onToggleStem,
      onDismissError,
      onSplit,
      onAddToQueue,
    },
  };
}

describe("SourcePanel", () => {
  beforeEach(() => {
    // Basic DOM globals used by UI, no-op stubs
    if (!(global as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
      (global as unknown as { ResizeObserver: unknown }).ResizeObserver = vi.fn(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      }));
    }
  });

  it("shows split mode by default with Split a track button", () => {
    renderSourcePanel();

    expect(screen.getByText(/Split a track or load stems to mix/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Split and Generate Stem Rack/i })).toBeInTheDocument();
  });

  it("calls onSourceModeChange when toggling to load mode", () => {
    const { handlers } = renderSourcePanel();

    fireEvent.click(screen.getByRole("button", { name: /Load stems \(mashup\)/i }));
    expect(handlers.onSourceModeChange).toHaveBeenCalledWith("load");
  });

  it("renders quality radio buttons and invokes onQualityChange", () => {
    const { handlers } = renderSourcePanel();

    const speedRadio = screen.getByLabelText(/speed — mdx onnx/i);
    fireEvent.click(speedRadio);
    expect(handlers.onQualityChange).toHaveBeenCalledWith("speed");
  });

  it("disables split button when no file uploaded", () => {
    renderSourcePanel({ uploadedFile: null });

    const splitButton = screen.getByRole("button", { name: /Split and Generate Stem Rack/i });
    expect(splitButton).toBeDisabled();
  });
});

