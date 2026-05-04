import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DevLatencyPanel } from "./dev-latency-panel.component";

describe("DevLatencyPanel", () => {
  it("toggles panel visibility", () => {
    render(
      <DevLatencyPanel
        latencyStats={{}}
        onResetLatencyStats={vi.fn()}
      />,
    );

    const hideButton = screen.getByRole("button", {
      name: /hide dev latency panel/i,
    });
    fireEvent.click(hideButton);
    expect(
      screen.getByRole("button", { name: /show dev latency panel/i }),
    ).toBeInTheDocument();
  });
});
