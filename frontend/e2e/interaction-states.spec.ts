import { test, expect } from "@playwright/test";
import { minimalWavFile } from "./fixtures/minimal-wav";

test.describe("Interaction states", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("burnt-beats-onboarding-complete", "true");
      localStorage.setItem("burntbeats_cookie_consent", "declined");
    });
  });

  test("split CTA shows keyboard focus ring after upload", async ({ page }) => {
    await page.goto("/");
    const panel = page.getByTestId("processing-settings-panel");
    await expect(panel).toBeVisible();

    await page.getByLabel("Choose audio file").setInputFiles(minimalWavFile("focus-test.wav"));

    const splitBtn = panel.locator("button.fire-button").first();
    await expect(splitBtn).toBeEnabled();
    await splitBtn.focus();
    await expect(splitBtn).toBeFocused();
  });

});
