import { test, expect } from "@playwright/test";
import { gotoHome, skipAllTours } from "./fixtures/helpers";

test.describe("Hub navigation", () => {
  test.beforeEach(async ({ page }) => {
    await skipAllTours(page);
  });

  test("hub chrome shows settings and account menus on home", async ({ page }) => {
    await gotoHome(page);
    await expect(page.getByTestId("settings-menu-trigger")).toBeVisible();
    await expect(
      page.getByTestId("account-menu").or(page.getByText("Local dev", { exact: true })).first(),
    ).toBeVisible();
  });

  test("primary and secondary cards navigate to expected routes", async ({ page }) => {
    await gotoHome(page);

    await page.getByRole("button", { name: /Split a Song/i }).click();
    await expect(page).toHaveURL(/\/editor/);

    await gotoHome(page);
    await page.getByRole("button", { name: /Your Splits/i }).click();
    await expect(page).toHaveURL(/\/library/);
  });

  test("beat templates label is fully visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoHome(page);

    const beatTemplates = page.getByRole("button", { name: /Beat Templates/i });
    await expect(beatTemplates).toBeVisible();

    const overflow = await beatTemplates.evaluate((el) => {
      const label = el.querySelector(".text-sm.font-medium");
      if (!label) return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      return { scrollWidth: label.scrollWidth, clientWidth: label.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("beat templates opens pattern library focus target", async ({ page }) => {
    await gotoHome(page);

    await page.getByRole("button", { name: /Beat Templates/i }).click();
    await expect(page).toHaveURL(/focus=patterns/);

    const patternLibrary = page.locator("#pattern-library");
    await expect(patternLibrary).toBeVisible({ timeout: 20_000 });
    await expect(patternLibrary).toBeInViewport({ timeout: 10_000 });
  });
});
