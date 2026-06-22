import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react"
import { screen, fireEvent } from "@testing-library/dom";
import { EditableDbValue } from "./editable-db-value.component";

describe("EditableDbValue", () => {
  it("renders formatted dB", () => {
    render(
      <EditableDbValue
        value={3}
        muted={false}
        stemLabel="Vocals"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("+3.0 dB")).toBeTruthy();
  });

  it("shows MUTE when muted", () => {
    render(
      <EditableDbValue
        value={0}
        muted
        stemLabel="Vocals"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("MUTE")).toBeTruthy();
  });

  it("commits clamped value on Enter", () => {
    const onChange = vi.fn();
    render(
      <EditableDbValue
        value={0}
        muted={false}
        stemLabel="Vocals"
        onChange={onChange}
      />,
    );
    fireEvent.doubleClick(screen.getByRole("button"));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("cancels on Escape", () => {
    const onChange = vi.fn();
    render(
      <EditableDbValue
        value={-3}
        muted={false}
        stemLabel="Vocals"
        onChange={onChange}
      />,
    );
    fireEvent.doubleClick(screen.getByRole("button"));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("-3.0 dB")).toBeTruthy();
  });
});
