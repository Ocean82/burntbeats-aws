import { test, expect } from "@playwright/test";
import { gotoEditor, skipOnboarding } from "./fixtures/helpers";
import { minimalWavFile } from "./fixtures/minimal-wav";

test.describe("Interaction states", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("split CTA shows keyboard focus ring after upload", async ({ page }) => {
    await gotoEditor(page);

    // Upload a file via the hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(minimalWavFile("focus-test.wav"));

    // Wait for configure phase
    await expect(page.getByTestId("configure-phase")).toBeVisible({ timeout: 5000 });

    const splitBtn = page.getByTestId("split-button");
    await expect(splitBtn).toBeEnabled();
    await splitBtn.focus();
    await expect(splitBtn).toBeFocused();
  });

});
