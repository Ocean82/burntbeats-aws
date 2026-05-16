import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PanKnob } from "./pan-knob.component";

describe("PanKnob", () => {
  it("renders center label at zero", () => {
    render(
      <PanKnob value={0} ariaLabel="vocals pan" onChange={() => {}} />,
    );
    expect(screen.getByText("C")).toBeTruthy();
  });

  it("double-click resets to center", () => {
    const onChange = vi.fn();
    const { container } = render(
      <PanKnob value={50} ariaLabel="vocals pan" onChange={onChange} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    fireEvent.doubleClick(svg!);
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("wheel adjusts value", () => {
    const onChange = vi.fn();
    const { container } = render(
      <PanKnob value={0} ariaLabel="vocals pan" onChange={onChange} />,
    );
    const svg = container.querySelector("svg");
    fireEvent.wheel(svg!, { deltaY: -100 });
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
