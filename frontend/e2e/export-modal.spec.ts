import { test, expect } from "@playwright/test";
import {
  gotoEditor,
  skipOnboarding,
  uploadAndSplit,
  waitForWorkspace,
} from "./fixtures/helpers";
import { minimalWavFile } from "./fixtures/minimal-wav";
import { mockSplitSuccess } from "./helpers/mock-split-success";

test.describe("Export options modal", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("opens from mixer after split completes; format targets expose pressed state", async ({
    page,
  }) => {
    await mockSplitSuccess(page);
    await gotoEditor(page);

    // Upload and split
    await uploadAndSplit(page, minimalWavFile("vocals.wav"));

    await waitForWorkspace(page);
    await expect(page.getByTestId("workspace").getByText(/vocals/i).first()).toBeVisible({ timeout: 10_000 });

    const exportBtn = page.getByTestId("workspace").getByRole("button", { name: "Export mix" });
    await expect(exportBtn).toBeEnabled({ timeout: 20_000 });
    await exportBtn.click();

    const dialog = page.getByRole("dialog", { name: /export options/i });
    await expect(dialog).toBeVisible();

    const wavOption = dialog.getByRole("radio", { name: /^WAV/i });
    await expect(wavOption).toBeChecked();

    const mp3Option = dialog.getByRole("radio", { name: /^MP3/i });
    await dialog.locator('label:has(input[value="mp3"])').click();
    await expect(mp3Option).toBeChecked();
    await expect(wavOption).not.toBeChecked();

    const masterTarget = dialog.getByRole("radio", { name: /master mix/i });
    await expect(masterTarget).toBeChecked();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("mastering preset picker visible after split job completes", async ({ page }) => {
    await page.route("**/api/master/presets**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          presets: [
            {
              id: "modern-rock",
              name: "Modern Rock",
              genre: "Rock",
              description: "Punchy rock master",
            },
          ],
        }),
      });
    });

    await mockSplitSuccess(page);

    await gotoEditor(page);

    // Upload and split
    await uploadAndSplit(page, minimalWavFile("e2e-split.wav"));

    await waitForWorkspace(page);
    await expect(page.getByTestId("workspace").getByText(/vocals/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("workspace").getByRole("button", { name: /^Play$/i })).toBeEnabled({
      timeout: 45_000,
    });

    const exportBtn = page.getByTestId("workspace").getByRole("button", { name: "Export mix" });
    await expect(exportBtn).toBeEnabled({ timeout: 15_000 });
    await exportBtn.click();

    const dialog = page.getByRole("dialog", { name: /export options/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Mastering preset")).toBeVisible();
    await expect(dialog.getByRole("option", { name: /Modern Rock/i })).toBeAttached();
  });
});
