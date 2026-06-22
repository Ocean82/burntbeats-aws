import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react"
import { screen } from "@testing-library/dom";
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

  it("renders file header with inline quality toggle and split CTA", () => {
    const { container } = renderSplitPanel();

    // File info and quality toggle live together in the header
    const changeFileButton = screen.getByRole("button", { name: /change/i });
    const qualityFastButton = screen.getByRole("button", { name: /fast/i });
    const qualityQualityButton = screen.getByRole("button", { name: /quality/i });

    expect(changeFileButton).toBeInTheDocument();
    expect(qualityFastButton).toBeInTheDocument();
    expect(qualityQualityButton).toBeInTheDocument();

    // Workflow selector and CTA are separate sections
    expect(screen.getByTestId("workflow-selector")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /full separation \(2 stems\)/i })).toBeInTheDocument();

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
