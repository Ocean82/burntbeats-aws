import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryDevDrawer } from "./LibraryDevDrawer";
import { restoreDevOverlays } from "../../app/dev-overlay-dismiss";

vi.mock("../../app/dev-health-panel.component", () => ({
  DevHealthPanel: () => <div data-testid="dev-health-embedded">Health</div>,
}));

describe("LibraryDevDrawer", () => {
  beforeEach(() => {
    restoreDevOverlays();
  });

  it("renders collapsed by default and expands on toggle", () => {
    render(
      <LibraryDevDrawer
        latencyStats={{}}
        onResetLatencyStats={vi.fn()}
      />,
    );

    expect(screen.getByTestId("library-dev-drawer")).toBeInTheDocument();
    expect(screen.queryByTestId("dev-latency-embedded")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /developer tools/i }),
    );

    expect(screen.getByTestId("dev-latency-embedded")).toBeInTheDocument();
    expect(screen.getByTestId("dev-health-embedded")).toBeInTheDocument();
  });

  it("hides drawer after session dismiss", () => {
    render(
      <LibraryDevDrawer
        latencyStats={{}}
        onResetLatencyStats={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /developer tools/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /hide developer tools for this session/i }),
    );

    expect(screen.queryByTestId("library-dev-drawer")).toBeNull();
  });
});
