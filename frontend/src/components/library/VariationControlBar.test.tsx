import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VariationControlBar } from "./VariationControlBar";

describe("VariationControlBar", () => {
  it("renders three variation buttons: Fill, Breakdown, Buildup", () => {
    render(
      <VariationControlBar onApply={() => {}} activeVariation={null} disabled={false} />,
    );

    expect(screen.getByRole("button", { name: "Fill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Breakdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buildup" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("disables all buttons when disabled prop is true", () => {
    render(
      <VariationControlBar onApply={() => {}} activeVariation={null} disabled={true} />,
    );

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it("enables all buttons when disabled prop is false", () => {
    render(
      <VariationControlBar onApply={() => {}} activeVariation={null} disabled={false} />,
    );

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).not.toBeDisabled();
    }
  });

  it("visually indicates active variation via aria-pressed", () => {
    render(
      <VariationControlBar onApply={() => {}} activeVariation="breakdown" disabled={false} />,
    );

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
    render(
      <VariationControlBar onApply={() => {}} activeVariation="fill" disabled={false} />,
    );

    const pressedButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.getAttribute("aria-pressed") === "true");
    expect(pressedButtons).toHaveLength(1);
    expect(pressedButtons[0]).toHaveTextContent("Fill");
  });

  it("no button is pressed when activeVariation is null", () => {
    render(
      <VariationControlBar onApply={() => {}} activeVariation={null} disabled={false} />,
    );

    const pressedButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.getAttribute("aria-pressed") === "true");
    expect(pressedButtons).toHaveLength(0);
  });

  it("calls onApply with 'fill' when Fill button is clicked", () => {
    const onApply = vi.fn();
    render(
      <VariationControlBar onApply={onApply} activeVariation={null} disabled={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect(onApply).toHaveBeenCalledWith("fill");
  });

  it("calls onApply with 'breakdown' when Breakdown button is clicked", () => {
    const onApply = vi.fn();
    render(
      <VariationControlBar onApply={onApply} activeVariation={null} disabled={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Breakdown" }));
    expect(onApply).toHaveBeenCalledWith("breakdown");
  });

  it("calls onApply with 'buildup' when Buildup button is clicked", () => {
    const onApply = vi.fn();
    render(
      <VariationControlBar onApply={onApply} activeVariation={null} disabled={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Buildup" }));
    expect(onApply).toHaveBeenCalledWith("buildup");
  });

  it("calls onApply with the active variation type when re-clicking (toggle off)", () => {
    const onApply = vi.fn();
    render(
      <VariationControlBar onApply={onApply} activeVariation="buildup" disabled={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Buildup" }));
    expect(onApply).toHaveBeenCalledWith("buildup");
  });

  it("does not call onApply when buttons are disabled", () => {
    const onApply = vi.fn();
    render(
      <VariationControlBar onApply={onApply} activeVariation={null} disabled={true} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    fireEvent.click(screen.getByRole("button", { name: "Breakdown" }));
    fireEvent.click(screen.getByRole("button", { name: "Buildup" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("buttons are keyboard accessible (not disabled, no negative tabindex)", () => {
    render(
      <VariationControlBar onApply={() => {}} activeVariation={null} disabled={false} />,
    );

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).not.toBeDisabled();
      expect(btn).not.toHaveAttribute("tabindex", "-1");
    }
  });

  it("has an accessible toolbar role with aria-label", () => {
    render(
      <VariationControlBar onApply={() => {}} activeVariation={null} disabled={false} />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Pattern variation controls" });
    expect(toolbar).toBeInTheDocument();
  });
});
