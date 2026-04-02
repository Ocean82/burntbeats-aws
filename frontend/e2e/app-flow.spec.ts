import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("Burnt Beats app (local full app mode)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("burnt-beats-onboarding-complete", "true");
    });
  });

  test("processing settings visible; split disabled without upload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("processing-settings-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Split stems$/ })).toBeDisabled();
  });

  test("mixer prompts before stems exist", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/Split a track or load stems to start mixing and exporting/i)
    ).toBeVisible();
  });

  test("quality and stem controls are available before split", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Number of stems" })).toBeVisible();
  });

  test("file input for upload exists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Choose audio file")).toBeAttached();
  });

  test("skip link moves focus to main content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("processing-settings-panel")).toBeVisible({ timeout: 20_000 });

    const skip = page.getByRole("link", { name: "Skip to main content" });
    const main = page.locator("#main-content");

    await expect(main).toHaveAttribute("tabindex", "-1");
    await skip.focus();
    await expect(skip).toBeFocused();
    await skip.click();
    await expect(main).toBeFocused();
  });
});
