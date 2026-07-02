import { test, expect } from "@playwright/test";
import { gotoBeats, skipOnboarding } from "./fixtures/helpers";

test.describe("Beat maker piano roll bridge", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("handoff opens drum pattern in MIDI editor", async ({ page }) => {
    await gotoBeats(page);
    await page.getByRole("tab", { name: /drum machine/i }).click();
    await expect(page.getByTestId("drum-machine-panel")).toBeVisible();

    await page.getByTestId("beat-grid-cell-0-0").click();
    await page.getByTestId("beat-edit-piano-roll").click();

    await expect(page).toHaveURL(/\/midi\?beat-handoff=1/);
    await expect(page.getByTestId("midi-convert-panel")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("midi-result-mode-edit")).toBeVisible({
      timeout: 20_000,
    });
  });
});
