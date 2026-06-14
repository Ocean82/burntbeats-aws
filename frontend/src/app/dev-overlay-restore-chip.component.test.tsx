import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DevOverlayRestoreChip } from "./dev-overlay-restore-chip.component";
import { dismissDevOverlays, restoreDevOverlays } from "./dev-overlay-dismiss";

describe("DevOverlayRestoreChip", () => {
  beforeEach(() => {
    restoreDevOverlays();
  });

  it("appears after dev overlays are dismissed and restores them", () => {
    dismissDevOverlays();

    render(<DevOverlayRestoreChip />);
    const restoreButton = screen.getByRole("button", {
      name: /restore dev overlay panels/i,
    });
    expect(restoreButton).toBeInTheDocument();

    fireEvent.click(restoreButton);
    expect(screen.queryByRole("button", { name: /restore dev overlay panels/i })).not.toBeInTheDocument();
  });
});
