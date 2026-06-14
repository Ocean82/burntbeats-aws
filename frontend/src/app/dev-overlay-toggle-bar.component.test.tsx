import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DevOverlayToggleBar } from "./dev-overlay-toggle-bar.component";
import { restoreDevOverlays } from "./dev-overlay-dismiss";

describe("DevOverlayToggleBar", () => {
  beforeEach(() => {
    restoreDevOverlays();
  });

  it("renders health and latency toggles in one right-aligned row", () => {
    render(
      <DevOverlayToggleBar
        healthToggle={<button type="button">Health</button>}
        latencyToggle={<button type="button">Latency</button>}
      />,
    );

    const bar = document.querySelector('[data-dev-overlay="toggle-bar"]');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveClass("right-4");
    expect(screen.getByRole("button", { name: "Health" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Latency" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /dismiss dev overlay panels/i }),
    ).toBeInTheDocument();
  });

  it("hides the bar after dismiss", () => {
    render(
      <DevOverlayToggleBar
        healthToggle={null}
        latencyToggle={<button type="button">Latency</button>}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /dismiss dev overlay panels/i }),
    );

    expect(document.querySelector('[data-dev-overlay="toggle-bar"]')).toBeNull();
  });
});
