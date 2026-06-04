import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { ProcessingSettingsPanel } from "../ProcessingSettingsPanel";
import { useAppStore } from "../../store/appStore";

vi.mock("../../hooks/useAppSubscription", () => ({
  useAppSubscription: () => ({
    subscription: {
      status: "active",
      plan: "basic",
      billingError: null,
      startCheckout: vi.fn(),
      capabilities: {
        canSplitFourStems: true,
        canUsePremiumStemQualities: true,
        canExpandToFourStems: false,
        canUseBatchQueue: false,
      },
    },
    usageBalance: null,
    usageLoading: false,
    stemQualityOptions: "full" as const,
    canSplitFourStems: true,
    canExpandToFourStems: false,
    canUseBatchQueue: false,
  }),
}));

function renderSplitPanel() {
  const uploadInputRef = createRef<HTMLInputElement>();
  const loadInputRef = createRef<HTMLInputElement>();

  const props = {
    sourceMode: "split" as const,
    onSourceModeChange: vi.fn(),
    inputRef: uploadInputRef,
    onBrowseUpload: vi.fn(),
    onClearUpload: vi.fn(),
    onDropUpload: vi.fn(),
    onUploadFileInput: vi.fn(),
    loadStemsInputRef: loadInputRef,
    onLoadStems: vi.fn(),
    onRemoveLoadedStem: vi.fn(),
    onSplit: vi.fn(),
  };

  return render(<ProcessingSettingsPanel {...props} />);
}

describe("ProcessingSettingsPanel layout", () => {
  beforeEach(() => {
    useAppStore.setState({
      uploadName: "track.wav",
      uploadedFile: new File([], "track.wav", { type: "audio/wav" }),
      quality: "speed",
      isDragging: false,
      isSplitting: false,
      splitResultStems: [],
      splitError: null,
      loadedStems: [],
    });
  });

  it("keeps upload and quality controls in separate responsive groups", () => {
    const { container } = renderSplitPanel();

    const changeFileButton = screen.getByRole("button", { name: /change/i });
    const qualityFastButton = screen.getByRole("button", { name: /fast/i });
    const uploadDropZone = screen.getByTestId("split-upload-dropzone");
    const qualityGroup = screen.getByTestId("quality-controls");
    const splitButton = screen.getByRole("button", {
      name: /full separation \(2 stems\)/i,
    });

    expect(uploadDropZone).toContainElement(changeFileButton);
    expect(qualityGroup).toContainElement(qualityFastButton);
    expect(uploadDropZone.className).toMatch(/w-full/);
    expect(qualityGroup.className).toContain("w-full");
    expect(splitButton.className).toContain("fire-button");
    expect(container.querySelector("[data-testid='processing-settings-panel']")).toBeInTheDocument();
  });

  it("does not offer the removed balanced quality mode", () => {
    renderSplitPanel();

    expect(screen.getByRole("button", { name: /fast/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quality/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /balanced/i }),
    ).not.toBeInTheDocument();
  });
});
