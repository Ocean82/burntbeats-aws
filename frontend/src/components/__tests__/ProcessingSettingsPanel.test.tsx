import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { SplitQuality } from "../../api";
import { ProcessingSettingsPanel } from "../ProcessingSettingsPanel";

function renderSplitPanel() {
  const uploadInputRef = createRef<HTMLInputElement>();
  const loadInputRef = createRef<HTMLInputElement>();

  const props = {
    sourceMode: "split" as const,
    onSourceModeChange: vi.fn(),
    uploadName: "",
    uploadedFile: null,
    inputRef: uploadInputRef,
    onBrowseUpload: vi.fn(),
    onClearUpload: vi.fn(),
    onDropUpload: vi.fn(),
    onUploadFileInput: vi.fn(),
    isDragging: false,
    onSetIsDragging: vi.fn(),
    loadedStemCount: 0,
    loadStemsInputRef: loadInputRef,
    onLoadStems: vi.fn(),
    loadedStems: [],
    onRemoveLoadedStem: vi.fn(),
    quality: "speed" as SplitQuality,
    onQualityChange: vi.fn(),
    onSplit: vi.fn(),
    isSplitting: false,
    splitResultStemsLength: 0,
    isExpanding: false,
    onExpand: vi.fn(),
    splitError: null,
    onDismissError: vi.fn(),
    onAddToQueue: vi.fn(),
  };

  return render(<ProcessingSettingsPanel {...props} />);
}

describe("ProcessingSettingsPanel layout", () => {
  it("keeps upload and quality controls in separate responsive groups", () => {
    const { container } = renderSplitPanel();

    const browseButton = screen.getByRole("button", { name: /browse/i });
    const qualityFastButton = screen.getByRole("button", { name: /fast/i });
    const uploadDropZone = screen.getByTestId("split-upload-dropzone");
    const qualityGroup = screen.getByTestId("quality-controls");
    const splitButton = screen.getByRole("button", { name: /split stems/i });

    expect(uploadDropZone).toContainElement(browseButton);
    expect(qualityGroup).toContainElement(qualityFastButton);
    expect(uploadDropZone.className).toContain("basis-full");
    expect(qualityGroup.className).toContain("w-full");
    expect(splitButton.className).toContain("fire-button");
    expect(container.querySelector("[data-testid='processing-settings-panel']")).toBeInTheDocument();
  });
});
