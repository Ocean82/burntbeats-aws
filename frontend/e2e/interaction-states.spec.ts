import { test, expect } from "@playwright/test";
import { gotoEditor, skipOnboarding } from "./fixtures/helpers";
import { minimalWavFile } from "./fixtures/minimal-wav";

test.describe("Interaction states", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("split CTA shows keyboard focus ring after upload", async ({ page }) => {
    await gotoEditor(page);
    const panel = page.getByTestId("processing-settings-panel");

    await page.getByLabel("Choose audio file").setInputFiles(minimalWavFile("focus-test.wav"));

    const splitBtn = panel.locator("button.fire-button").first();
    await expect(splitBtn).toBeEnabled();
    await splitBtn.focus();
    await expect(splitBtn).toBeFocused();
  });

});
