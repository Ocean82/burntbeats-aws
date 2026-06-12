/**
 * Unit tests for ProcessingSettingsPanel — SRE reliability wiring.
 *
 * Task 7.2: ErrorState wiring — Validates: Requirements 7.1, 7.3
 * Task 15.2: SuccessFlash wiring — Validates: Requirements 15.1, 15.2
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type React from "react";
import { ProcessingSettingsPanel } from "../ProcessingSettingsPanel";

// ── framer-motion: render children inline, skip animation ──────────────────
vi.mock("framer-motion", () => {
  const React = require("react");
  return {
    motion: {
      div: ({ children, ...rest }: React.ComponentPropsWithoutRef<"div">) =>
        React.createElement("div", rest, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => true,
  };
});

// ── Heavy sub-components: stub out to avoid deep dependency trees ──────────
vi.mock("../UploadDropZone", () => ({
  UploadDropZone: () => <div data-testid="upload-drop-zone" />,
}));
vi.mock("../LoadStemsZone", () => ({
  LoadStemsZone: () => <div data-testid="load-stems-zone" />,
}));
vi.mock("../QualitySelector", () => ({
  QualitySelector: () => <div data-testid="quality-selector" />,
}));
vi.mock("../SplitIntentQuickActions", () => ({
  SplitIntentQuickActions: () => <div data-testid="split-intent-quick" />,
}));
vi.mock("../SplitIntentAdvanced", () => ({
  SplitIntentAdvanced: () => <div data-testid="split-intent-advanced" />,
  advancedSelectionToIntent: () => null,
}));
vi.mock("../FullSeparationOptions", () => ({
  FullSeparationOptions: () => <div data-testid="full-separation-options" />,
  fullSeparationIntent: (mode: string) => ({ task: "full_separation", mode }),
}));
vi.mock("../SplitActions", () => ({
  SplitActions: () => <div data-testid="split-actions" />,
}));
vi.mock("../UsageTokenRow", () => ({
  UsageTokenRow: () => <div data-testid="usage-token-row" />,
}));
vi.mock("../ExpandStemsAction", () => ({
  ExpandStemsAction: () => <div data-testid="expand-stems-action" />,
}));
vi.mock("../NewSplitConfirmDialog", () => ({
  NewSplitConfirmDialog: () => <div data-testid="new-split-confirm-dialog" />,
}));
vi.mock("../../SharePreviewButton", () => ({
  SharePreviewButton: () => <div data-testid="share-preview-button" />,
}));
vi.mock("../../ui/SegmentedControl", () => ({
  SegmentedControl: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <div data-testid="segmented-control">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
}));

// ── useProcessingSettingsData: the primary hook mock ──────────────────────
const mockHookReturnValue = {
  uploadName: null,
  uploadedFile: null,
  loadedStems: [],
  loadedStemCount: 0,
  quality: "quality" as const,
  isDragging: false,
  onSetIsDragging: vi.fn(),
  onQualityChange: vi.fn(),
  stemQualityOptions: "all" as const,
  canSplitFourStems: false,
  isSplitting: false,
  splitProgress: 0,
  uploadProgress: 0,
  isUploading: false,
  queuePosition: null,
  jobsAhead: null,
  splitElapsedSeconds: 0,
  splitStageLabel: null,
  uploadDurationSec: null,
  splitResultStemsLength: 0,
  splitError: null as string | null,
  onDismissError: vi.fn(),
  canUseBatchQueue: false,
  onUpgradeToPremium: vi.fn(),
  subscriptionInactive: false,
  onContinueCheckout: vi.fn(),
  usageBalance: null,
  usageLoading: false,
  estimatedSplitTokens: null,
  isCollapsed: false,
  canExpandToFourStems: false,
  isExpanding: false,
  splitJobId: null,
  setUploadState: vi.fn(),
  setSplitError: vi.fn(),
  subscription: {
    status: "active",
    startCheckout: vi.fn(),
  },
  isSample: false,
};

vi.mock("../useProcessingSettingsData", () => ({
  useProcessingSettingsData: () => mockHookReturnValue,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

/** Minimal valid props for ProcessingSettingsPanel */
function buildProps(overrides?: Partial<React.ComponentPropsWithoutRef<typeof ProcessingSettingsPanel>>) {
  const inputRef = { current: null } as React.MutableRefObject<HTMLInputElement | null>;
  const loadStemsInputRef = { current: null } as React.MutableRefObject<HTMLInputElement | null>;
  return {
    sourceMode: "split" as const,
    onSourceModeChange: vi.fn(),
    inputRef,
    loadStemsInputRef,
    onBrowseUpload: vi.fn(),
    onClearUpload: vi.fn(),
    onDropUpload: vi.fn(),
    onUploadFileInput: vi.fn(),
    onLoadStems: vi.fn(),
    onRemoveLoadedStem: vi.fn(),
    onSplit: vi.fn(),
    ...overrides,
  };
}

// ── Test setup/teardown ────────────────────────────────────────────────────

beforeEach(() => {
  // Reset all mocks on hook return value back to defaults
  mockHookReturnValue.splitError = null;
  mockHookReturnValue.splitResultStemsLength = 0;
  mockHookReturnValue.isCollapsed = false;
  mockHookReturnValue.onDismissError = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.2 — ErrorState wiring
// Validates: Requirements 7.1, 7.3
// ─────────────────────────────────────────────────────────────────────────────
describe("7.2 ProcessingSettingsPanel — ErrorState wiring", () => {
  it("renders ErrorState with variant=server when splitError is non-null", () => {
    mockHookReturnValue.splitError = "Split service unavailable";

    render(<ProcessingSettingsPanel {...buildProps()} />);

    // ErrorState renders with role="alert"
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();

    // The error description text is displayed
    expect(screen.getByText("Split service unavailable")).toBeInTheDocument();

    // The "Couldn't split this track" title is present (from the variant="server" wiring)
    expect(screen.getByText("Couldn't split this track")).toBeInTheDocument();
  });

  it("does not render ErrorState when splitError is null", () => {
    mockHookReturnValue.splitError = null;

    render(<ProcessingSettingsPanel {...buildProps()} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onDismissError and onSplit when retry button is clicked", () => {
    const onSplit = vi.fn();
    const onDismissError = vi.fn();

    mockHookReturnValue.splitError = "Split service unavailable";
    mockHookReturnValue.onDismissError = onDismissError;

    render(<ProcessingSettingsPanel {...buildProps({ onSplit })} />);

    const retryButton = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryButton);

    expect(onDismissError).toHaveBeenCalledOnce();
    expect(onSplit).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 15.2 — SuccessFlash wiring
// Validates: Requirements 15.1, 15.2
// ─────────────────────────────────────────────────────────────────────────────
describe("15.2 ProcessingSettingsPanel — SuccessFlash wiring", () => {
  it("shows SuccessFlash when splitResultStemsLength transitions from 0 to > 0", () => {
    mockHookReturnValue.splitResultStemsLength = 0;

    const { rerender } = render(<ProcessingSettingsPanel {...buildProps()} />);

    // No flash yet
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Simulate the 0 → N transition
    mockHookReturnValue.splitResultStemsLength = 2;

    act(() => {
      rerender(<ProcessingSettingsPanel {...buildProps()} />);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Action completed successfully"),
    ).toBeInTheDocument();
  });

  it("hides SuccessFlash after onComplete fires (simulated via timer expiry)", async () => {
    vi.useFakeTimers();

    mockHookReturnValue.splitResultStemsLength = 0;

    const { rerender } = render(<ProcessingSettingsPanel {...buildProps()} />);

    // Trigger the flash
    mockHookReturnValue.splitResultStemsLength = 2;
    act(() => {
      rerender(<ProcessingSettingsPanel {...buildProps()} />);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    // Advance past default duration (1200 ms) — SuccessFlash calls onComplete,
    // which sets showSuccessFlash=false in the panel, which hides the element.
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("does not show SuccessFlash when splitResultStemsLength stays at 0", () => {
    mockHookReturnValue.splitResultStemsLength = 0;

    const { rerender } = render(<ProcessingSettingsPanel {...buildProps()} />);

    act(() => {
      rerender(<ProcessingSettingsPanel {...buildProps()} />);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not show SuccessFlash when stems go from N to M without passing through 0 (ref tracks transitions)", () => {
    // Start at 0
    mockHookReturnValue.splitResultStemsLength = 0;
    const { rerender } = render(<ProcessingSettingsPanel {...buildProps()} />);

    // Trigger 0 → 2 flash and advance timers so the flash completes and show resets
    vi.useFakeTimers();
    mockHookReturnValue.splitResultStemsLength = 2;
    act(() => {
      rerender(<ProcessingSettingsPanel {...buildProps()} />);
    });
    // Flash should be showing
    expect(screen.getByRole("status")).toBeInTheDocument();

    // Let it expire — onComplete fires, panel resets showSuccessFlash to false
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Now update from 2 → 4 — no new 0→N transition so no new flash
    mockHookReturnValue.splitResultStemsLength = 4;
    act(() => {
      rerender(<ProcessingSettingsPanel {...buildProps()} />);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
