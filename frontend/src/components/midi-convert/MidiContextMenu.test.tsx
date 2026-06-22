import { render } from "@testing-library/react"
import { fireEvent, screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { MidiContextMenu } from "./MidiContextMenu";

describe("MidiContextMenu", () => {
  it("renders note actions and dispatches handlers", () => {
    const onClose = vi.fn();
    const onDelete = vi.fn();
    const onQuantize = vi.fn();
    const onToggleMute = vi.fn();
    const onChannelChange = vi.fn();
    const onLegato = vi.fn();
    const onHumanize = vi.fn();

    render(
      <MidiContextMenu
        open
        x={40}
        y={50}
        note={{
          id: "n1",
          pitch: 60,
          start: 0,
          duration: 1,
          velocity: 100,
          channel: 2,
          muted: false,
        }}
        hasSelection
        onClose={onClose}
        onDelete={onDelete}
        onQuantize={onQuantize}
        onToggleMute={onToggleMute}
        onChannelChange={onChannelChange}
        onLegato={onLegato}
        onHumanize={onHumanize}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Quantize" }));
    expect(onQuantize).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Mute note" }));
    expect(onToggleMute).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "8" } });
    expect(onChannelChange).toHaveBeenCalledWith(8);

    fireEvent.click(screen.getByRole("button", { name: "Legato" }));
    expect(onLegato).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Humanize" }));
    expect(onHumanize).toHaveBeenCalledTimes(1);
  });
});
