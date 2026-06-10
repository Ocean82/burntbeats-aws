import { test, expect } from "@playwright/test";
import { gotoEditor, skipOnboarding } from "./fixtures/helpers";
import { minimalWavFile } from "./fixtures/minimal-wav";

test.describe.configure({ mode: "serial" });

test.describe("Burnt Beats app (local full app mode)", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("upload phase visible; split button appears after upload and configure", async ({
    page,
  }) => {
    await gotoEditor(page);
    // Upload phase should be visible initially
    await expect(page.getByTestId("upload-phase")).toBeVisible();

    // Upload a file via the hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(minimalWavFile("e2e-tiny.wav"));

    // Should transition to configure phase
    await expect(page.getByTestId("configure-phase")).toBeVisible({ timeout: 5000 });

    // Split button should be visible and enabled
    await expect(page.getByTestId("split-button")).toBeEnabled();
  });

  test("upload phase shown before stems exist", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("editor-app-shell")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("upload-phase")).toBeVisible();
  });

  test("file input for upload exists", async ({ page }) => {
    await gotoEditor(page);
    await expect(page.getByTestId("upload-phase")).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test("skip link moves focus to main content", async ({ page }) => {
    await gotoEditor(page);

    const skip = page.getByRole("link", { name: "Skip to main content" });
    const main = page.locator("#main-content");

    await expect(main).toHaveAttribute("tabindex", "-1");
    await skip.focus();
    await expect(skip).toBeFocused();
    await skip.click();
    await expect(main).toBeFocused();
  });
});
