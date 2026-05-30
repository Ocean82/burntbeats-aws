import { test, expect } from "@playwright/test";
import { minimalWavBuffer, skipOnboarding } from "./fixtures/helpers";
import { mockSplitSuccess } from "./helpers/mock-split-success";

test.describe("Ship polish layout", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("mobile stacks stem processing panel above timeline", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSplitSuccess(page);
    await page.goto("/");

    await page.getByLabel("Choose audio file").setInputFiles({
      name: "layout-test.wav",
      mimeType: "audio/wav",
      buffer: minimalWavBuffer(),
    });

    await page
      .getByTestId("processing-settings-panel")
      .locator("button.fire-button")
      .first()
      .click();

    await expect(page.getByText(/vocals/i).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("button", { name: /^Play$/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Pitch", exact: true }).click();

    const mobilePanel = page
      .locator(".dj-waveform-section")
      .locator(".md\\:hidden")
      .filter({ hasText: "Pitch Shift" });
    await expect(mobilePanel).toBeVisible();

    const desktopRail = page
      .locator(".dj-waveform-section")
      .locator(".md\\:block")
      .filter({ hasText: "Pitch Shift" });
    await expect(desktopRail).toBeHidden();
  });

  test("MIDI convert page is usable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page
      .getByLabel("Workspace tabs")
      .getByRole("button", { name: /MIDI/i })
      .click();
    await expect(page.getByTestId("midi-convert-page")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("midi-convert-panel")).toBeVisible();
    await expect(page.getByText(/Audio to MIDI/i)).toBeVisible();
  });
});
