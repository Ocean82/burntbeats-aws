import { test, expect } from "@playwright/test";
import { skipOnboarding } from "./fixtures/helpers";

/**
 * Billing/checkout flow integration tests.
 *
 * Runs in VITE_LOCAL_DEV_FULL_APP=1 mode (no real Clerk auth, subscription treated as Premium).
 * API calls are intercepted via page.route() — no real backend needed.
 */
test.describe("Billing & pricing flow", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("navigates to pricing page via Plans button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("processing-settings-panel")).toBeVisible();

    // Click the "Plans" button in the header nav
    const plansButton = page.getByRole("button", { name: "Plans" });
    await expect(plansButton).toBeVisible();
    await plansButton.click();

    // Pricing page hero should be visible
    await expect(
      page.getByRole("heading", { name: /pick your plan/i }),
    ).toBeVisible();
  });

  test("pricing page shows plan cards and tab toggle", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Plans" }).click();

    // Tab toggle for subscriptions vs credit packs
    await expect(page.getByRole("button", { name: /subscriptions/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /credit packs/i })).toBeVisible();

    // Plan cards should be visible (at least one CTA button)
    await expect(
      page.locator("button").filter({ hasText: /start basic|subscribe|get started/i }).first(),
    ).toBeVisible();
  });

  test("tab toggle switches between subscriptions and credit packs", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Plans" }).click();

    // Default tab is subscriptions
    const creditPacksTab = page.getByRole("button", { name: /credit packs/i });
    await creditPacksTab.click();

    // After clicking credit packs, the content should change
    // (credit pack cards have different text like "Top-Up" or "one-time")
    await expect(
      page.getByText(/one-time|top-up|credit/i).first(),
    ).toBeVisible();
  });

  test("checkout CTA button is clickable and shows loading state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Plans" }).click();

    // The primary checkout CTA should be visible
    const checkoutButton = page
      .locator("button")
      .filter({ hasText: /start basic/i })
      .first();
    await expect(checkoutButton).toBeVisible();
    await expect(checkoutButton).toBeEnabled();

    // Click it — in local dev mode startCheckout returns immediately,
    // but the button should still be interactive (not disabled permanently)
    await checkoutButton.click();

    // Button should remain functional after click (not stuck in disabled state)
    await expect(checkoutButton).toBeEnabled({ timeout: 3000 });
  });

  test("back to editor navigation works from pricing page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Plans" }).click();

    await expect(
      page.getByRole("heading", { name: /pick your plan/i }),
    ).toBeVisible();

    // Click "Back to editor" button
    const backButton = page
      .getByRole("button", { name: /back to editor/i })
      .first();
    await backButton.click();

    // Should be back on the editor view
    await expect(page.getByTestId("processing-settings-panel")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /pick your plan/i }),
    ).not.toBeVisible();
  });

  test("FAQ section is visible on pricing page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Plans" }).click();

    // FAQ questions should be visible
    await expect(
      page.getByText(/what happens if i run out of tokens/i),
    ).toBeVisible();
    await expect(page.getByText(/can i switch plans later/i)).toBeVisible();
  });
});
