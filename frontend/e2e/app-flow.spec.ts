import { test, expect } from "@playwright/test";
import { gotoEditor, skipOnboarding } from "./fixtures/helpers";
import { minimalWavFile } from "./fixtures/minimal-wav";

test.describe.configure({ mode: "serial" });

test.describe("Burnt Beats app (local full app mode)", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("processing settings visible; split CTA appears after upload and is enabled", async ({
    page,
  }) => {
    await gotoEditor(page);
    const panel = page.getByTestId("processing-settings-panel");
    await expect(panel.getByTestId("split-upload-dropzone")).toBeVisible();
    // Progressive disclosure: no primary split row until a file is selected (see ProcessingSettingsPanel).
    await expect(panel.locator("button.fire-button")).toHaveCount(0);

    await page.getByLabel("Choose audio file").setInputFiles(minimalWavFile("e2e-tiny.wav"));

    await expect(panel.locator("button.fire-button").first()).toBeEnabled();
  });

  test("mixer prompts before stems exist", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: /timeline waiting for stems/i }),
    ).toBeVisible();
    await expect(page.getByText(/Timeline opens after split/i)).toBeVisible();
  });

  test("load mode shows stem dropzone without requiring upload", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("source-mode-load").click();
    await expect(page.getByTestId("load-upload-dropzone")).toBeVisible();
    await expect(
      page.getByText(/click to load stems or drag/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Browse" })).toBeVisible();
  });

  test("file input for upload exists", async ({ page }) => {
    await gotoEditor(page);
    await expect(page.getByLabel("Choose audio file")).toBeAttached();
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
