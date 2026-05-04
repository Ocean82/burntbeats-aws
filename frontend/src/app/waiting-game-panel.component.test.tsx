import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WaitingGamePanel } from "./waiting-game-panel.component";

describe("WaitingGamePanel", () => {
  it("renders toggle button and calls handlers", () => {
    const onToggle = vi.fn();
    const onClose = vi.fn();

    render(
      <WaitingGamePanel
        showGame={false}
        isSplitting={false}
        reduceMotion
        onToggle={onToggle}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open the waiting game/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(0);
  });
});
