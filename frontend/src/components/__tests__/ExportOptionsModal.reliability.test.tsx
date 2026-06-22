/**
 * Reliability wiring tests for ExportOptionsModal.
 *
 * Task 10.2 — Validates: Requirements 10.1, 10.3
 *   ErrorState appears when onExport rejects; retry calls onExport again.
 *
 * Task 16.2 — Validates: Requirements 16.1, 16.2
 *   SuccessFlash appears when onExport resolves; onComplete resets show to false.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react"
import { screen, fireEvent, waitFor } from "@testing-library/dom";
import { ExportOptionsModal } from "../ExportOptionsModal";

// ---- framer-motion mock (standard project pattern) ----
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

// ---- fetchMasteringPresets mock — prevents real network calls ----
vi.mock("../../api/master", () => ({
  fetchMasteringPresets: vi.fn().mockResolvedValue([]),
}));

// ---- Minimal default props ----
const DEFAULT_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  isExporting: false,
  stemCount: 2,
};

function renderModal(overrides: Partial<typeof DEFAULT_PROPS & { onExport: () => Promise<void> }> = {}) {
  const onExport = overrides.onExport ?? vi.fn().mockResolvedValue(undefined);
  const props = { ...DEFAULT_PROPS, onExport, ...overrides };
  return { ...render(<ExportOptionsModal {...props} />), onExport };
}

// ---- Helper: click the export button ----
// The modal has multiple buttons matching /export/i (including "Close export options"),
// so we target the submit button by its aria-busy attribute which only the export button has.
function clickExport() {
  const exportButton = screen.getByRole("button", { name: /export master/i });
  fireEvent.click(exportButton);
}

// ============================================================
// Task 10.2: ErrorState wiring
// Validates: Requirements 10.1, 10.3
// ============================================================
describe("ExportOptionsModal — ErrorState wiring (Req 10.1, 10.3)", () => {
  it("shows <ErrorState> when onExport rejects", async () => {
    const { onExport } = renderModal({
      onExport: vi.fn().mockRejectedValueOnce(new Error("Network error")),
    });

    await act(async () => {
      clickExport();
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // ErrorState with variant="server" renders the title "Export failed"
    expect(screen.getByText("Export failed")).toBeInTheDocument();
    // The error message description is shown
    expect(screen.getByText("Network error")).toBeInTheDocument();

    // onExport was called once for the initial attempt
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("calls onExport again when the retry button is clicked (Req 10.3)", async () => {
    const onExport = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValue(undefined);

    renderModal({ onExport });

    // Trigger initial export → rejection
    await act(async () => {
      clickExport();
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Click "Try again" inside ErrorState
    const retryButton = screen.getByRole("button", { name: /try again/i });
    await act(async () => {
      fireEvent.click(retryButton);
    });

    // onExport should now have been called twice
    expect(onExport).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// Task 16.2: SuccessFlash wiring
// Validates: Requirements 16.1, 16.2
// ============================================================
describe("ExportOptionsModal — SuccessFlash wiring (Req 16.1, 16.2)", () => {
  it("shows <SuccessFlash show={true}> after onExport resolves (Req 16.1)", async () => {
    renderModal({
      onExport: vi.fn().mockResolvedValue(undefined),
    });

    await act(async () => {
      clickExport();
    });

    // SuccessFlash renders an accessible status element when show=true
    await waitFor(() => {
      expect(
        screen.getByRole("status", { name: /action completed successfully/i }),
      ).toBeInTheDocument();
    });
  });

  it("resets show to false after onComplete fires (Req 16.2)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderModal({
      onExport: vi.fn().mockResolvedValue(undefined),
    });

    // Trigger export and wait for the flash to appear
    await act(async () => {
      clickExport();
      // Flush the resolved promise microtask so state updates run
      await Promise.resolve();
    });

    // The flash should be visible now
    expect(
      screen.getByRole("status", { name: /action completed successfully/i }),
    ).toBeInTheDocument();

    // Advance past SuccessFlash default duration (1200 ms) so its internal
    // setTimeout fires and onComplete is called, resetting showSuccessFlash
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });

    // After onComplete the flash should be gone
    expect(
      screen.queryByRole("status", { name: /action completed successfully/i }),
    ).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
