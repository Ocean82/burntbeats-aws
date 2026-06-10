import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EffectsPanelBottomSheet } from "./EffectsPanelBottomSheet";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, onTouchStart, onTouchEnd, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => {
      return (
        <div {...rest} onTouchStart={onTouchStart as React.TouchEventHandler} onTouchEnd={onTouchEnd as React.TouchEventHandler}>
          {children}
        </div>
      );
    },
  },
  useReducedMotion: () => false,
}));

// Mock EffectsPanel
vi.mock("./EffectsPanel", () => ({
  EffectsPanel: ({ activeTool, isOverlay }: Record<string, unknown>) => (
    <div data-testid="effects-panel" data-tool={activeTool as string} data-overlay={String(isOverlay)}>
      Effects Panel Content
    </div>
  ),
}));

describe("EffectsPanelBottomSheet", () => {
  const defaultProps = {
    activeTool: "eq" as const,
    onClose: vi.fn(),
  };

  it("renders the bottom sheet with correct max-height of 60vh", () => {
    render(<EffectsPanelBottomSheet {...defaultProps} />);

    const sheet = screen.getByTestId("effects-bottom-sheet");
    expect(sheet).toBeInTheDocument();
    expect(sheet.style.maxHeight).toBe("60vh");
  });

  it("renders a backdrop overlay", () => {
    render(<EffectsPanelBottomSheet {...defaultProps} />);

    expect(screen.getByTestId("bottom-sheet-backdrop")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<EffectsPanelBottomSheet {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByTestId("bottom-sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<EffectsPanelBottomSheet {...defaultProps} onClose={onClose} />);

    const closeBtn = screen.getByLabelText("Close effects panel");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders EffectsPanel with isOverlay prop", () => {
    render(<EffectsPanelBottomSheet {...defaultProps} />);

    const panel = screen.getByTestId("effects-panel");
    expect(panel.getAttribute("data-overlay")).toBe("true");
    expect(panel.getAttribute("data-tool")).toBe("eq");
  });

  it("has role=dialog and aria-label for accessibility", () => {
    render(<EffectsPanelBottomSheet {...defaultProps} />);

    const sheet = screen.getByRole("dialog");
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveAttribute("aria-label", "Effects panel");
    expect(sheet).toHaveAttribute("aria-modal", "true");
  });

  it("dismisses on swipe down greater than 100px", () => {
    const onClose = vi.fn();
    render(<EffectsPanelBottomSheet {...defaultProps} onClose={onClose} />);

    const sheet = screen.getByTestId("effects-bottom-sheet");

    // Simulate touch swipe down > 100px
    fireEvent.touchStart(sheet, {
      touches: [{ clientY: 100 }],
    });
    fireEvent.touchEnd(sheet, {
      changedTouches: [{ clientY: 250 }],
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss on small swipe down (< 100px)", () => {
    const onClose = vi.fn();
    render(<EffectsPanelBottomSheet {...defaultProps} onClose={onClose} />);

    const sheet = screen.getByTestId("effects-bottom-sheet");

    // Simulate small touch swipe
    fireEvent.touchStart(sheet, {
      touches: [{ clientY: 100 }],
    });
    fireEvent.touchEnd(sheet, {
      changedTouches: [{ clientY: 150 }],
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
