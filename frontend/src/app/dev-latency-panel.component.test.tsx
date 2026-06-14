import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DevLatencyPanel } from "./dev-latency-panel.component";
import { restoreDevOverlays } from "./dev-overlay-dismiss";

describe("DevLatencyPanel", () => {
  beforeEach(() => {
    restoreDevOverlays();
  });

  it("toggles panel visibility", () => {
    render(
      <DevLatencyPanel
        latencyStats={{}}
        onResetLatencyStats={vi.fn()}
      />,
    );

    const showButton = screen.getByRole("button", {
      name: /show dev latency panel/i,
    });
    fireEvent.click(showButton);
    expect(
      screen.getByRole("button", { name: /hide dev latency panel/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide dev latency panel/i }));
    expect(
      screen.getByRole("button", { name: /show dev latency panel/i }),
    ).toBeInTheDocument();
  });

  it("hides toggles when dev overlays are dismissed for the session", () => {
    render(
      <DevLatencyPanel
        latencyStats={{}}
        onResetLatencyStats={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /dismiss dev overlay panels/i }),
    );

    expect(
      screen.queryByRole("button", { name: /show dev latency panel/i }),
    ).not.toBeInTheDocument();
  });
});
