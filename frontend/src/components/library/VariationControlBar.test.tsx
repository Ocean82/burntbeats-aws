import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VariationControlBar } from "./VariationControlBar";

const defaultProps = {
  onApply: vi.fn(),
  activeVariation: null,
  disabled: false,
  canUseVariations: true,
} as const;

describe("VariationControlBar", () => {
  it("renders three variation buttons: Fill, Breakdown, Buildup", () => {
    render(<VariationControlBar {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Fill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Breakdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buildup" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("disables all buttons when disabled prop is true", () => {
    render(<VariationControlBar {...defaultProps} disabled={true} />);

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it("enables all buttons when disabled prop is false", () => {
    render(<VariationControlBar {...defaultProps} disabled={false} />);

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).not.toBeDisabled();
    }
  });

  it("visually indicates active variation via aria-pressed", () => {
    render(<VariationControlBar {...defaultProps} activeVariation="breakdown" />);

    expect(screen.getByRole("button", { name: "Fill" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Breakdown" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Buildup" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("only one button has aria-pressed=true at a time", () => {
    render(<VariationControlBar {...defaultProps} activeVariation="fill" />);

    const pressedButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.getAttribute("aria-pressed") === "true");
    expect(pressedButtons).toHaveLength(1);
    expect(pressedButtons[0]).toHaveTextContent("Fill");
  });

  it("no button is pressed when activeVariation is null", () => {
    render(<VariationControlBar {...defaultProps} />);

    const pressedButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.getAttribute("aria-pressed") === "true");
    expect(pressedButtons).toHaveLength(0);
  });

  it("calls onApply with 'fill' when Fill button is clicked", () => {
    const onApply = vi.fn();
    render(<VariationControlBar {...defaultProps} onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect(onApply).toHaveBeenCalledWith("fill");
  });

  it("calls onApply with 'breakdown' when Breakdown button is clicked", () => {
    const onApply = vi.fn();
    render(<VariationControlBar {...defaultProps} onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: "Breakdown" }));
    expect(onApply).toHaveBeenCalledWith("breakdown");
  });

  it("calls onApply with 'buildup' when Buildup button is clicked", () => {
    const onApply = vi.fn();
    render(<VariationControlBar {...defaultProps} onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: "Buildup" }));
    expect(onApply).toHaveBeenCalledWith("buildup");
  });

  it("calls onApply with the active variation type when re-clicking (toggle off)", () => {
    const onApply = vi.fn();
    render(
      <VariationControlBar {...defaultProps} onApply={onApply} activeVariation="buildup" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Buildup" }));
    expect(onApply).toHaveBeenCalledWith("buildup");
  });

  it("does not call onApply when buttons are disabled", () => {
    const onApply = vi.fn();
    render(<VariationControlBar {...defaultProps} onApply={onApply} disabled={true} />);

    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    fireEvent.click(screen.getByRole("button", { name: "Breakdown" }));
    fireEvent.click(screen.getByRole("button", { name: "Buildup" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("calls onUpgradeRequest instead of onApply when variations are locked", () => {
    const onApply = vi.fn();
    const onUpgradeRequest = vi.fn();
    render(
      <VariationControlBar
        {...defaultProps}
        onApply={onApply}
        canUseVariations={false}
        onUpgradeRequest={onUpgradeRequest}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onUpgradeRequest).toHaveBeenCalled();
  });

  it("buttons are keyboard accessible (not disabled, no negative tabindex)", () => {
    render(<VariationControlBar {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).not.toBeDisabled();
      expect(btn).not.toHaveAttribute("tabindex", "-1");
    }
  });

  it("has an accessible toolbar role with aria-label", () => {
    render(<VariationControlBar {...defaultProps} />);

    const toolbar = screen.getByRole("toolbar", {
      name: "Overlay pattern variation controls",
    });
    expect(toolbar).toBeInTheDocument();
  });
});
