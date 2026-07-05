import { test, expect } from "@playwright/test";
import {
  E2E_APP_READY_MS,
  gotoBeats,
  gotoHome,
  openPricingPage,
  skipOnboarding,
} from "./fixtures/helpers";

test.describe("UI state consistency", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("speech clean page shows empty state CTA", async ({ page }) => {
    await page.goto("/speech");
    await expect(page.getByTestId("speech-clean-page")).toBeVisible({
      timeout: E2E_APP_READY_MS,
    });
    await expect(
      page.getByRole("button", { name: /clean vocals|upload/i }).first(),
    ).toBeVisible();
  });

  test("tuner page shows idle start mic CTA", async ({ page }) => {
    await page.goto("/tuner");
    await expect(page.getByTestId("tuner-page")).toBeVisible({
      timeout: E2E_APP_READY_MS,
    });
    await expect(page.getByRole("button", { name: /start mic/i })).toBeVisible();
  });

  test("beats catalog shows empty state when no results", async ({ page }) => {
    await page.route("**/api/catalog/midi**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 0,
          offset: 0,
          limit: 50,
          entries: [],
          statistics: { total_entries: 0, by_genre: {} },
        }),
      });
    });

    await gotoBeats(page);
    await expect(page.getByTestId("midi-catalog-panel")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/no matches/i)).toBeVisible();
  });

  test("pricing page loads with plan content after subscription resolves", async ({
    page,
  }) => {
    await gotoHome(page);
    await openPricingPage(page);
    await expect(
      page.getByRole("heading", { name: /pick your plan/i }),
    ).toBeVisible({ timeout: E2E_APP_READY_MS });
  });
});
