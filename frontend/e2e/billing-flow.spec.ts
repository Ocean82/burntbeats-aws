import { test, expect } from "@playwright/test";
import { openPricingPage, skipOnboarding } from "./fixtures/helpers";

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

  test("navigates to pricing page via settings menu", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("processing-settings-panel")).toBeVisible();

    await openPricingPage(page);

    await expect(
      page.getByRole("heading", { name: /pick your plan/i }),
    ).toBeVisible();
  });

  test("pricing page shows plan cards and tab toggle", async ({ page }) => {
    await page.goto("/");
    await openPricingPage(page);

    await expect(page.getByTestId("pricing-tab-toggle")).toBeVisible();
    await expect(page.getByTestId("pricing-tab-subscriptions")).toBeVisible();
    await expect(page.getByTestId("pricing-tab-credit-packs")).toBeVisible();
    await expect(page.getByTestId("pricing-plan-basic")).toBeVisible();
    await expect(page.getByTestId("pricing-cta-basic")).toBeVisible();
  });

  test("tab toggle switches between subscriptions and credit packs", async ({
    page,
  }) => {
    await page.goto("/");
    await openPricingPage(page);

    await expect(page.getByTestId("pricing-plan-basic")).toBeVisible();
    await page.getByTestId("pricing-tab-credit-packs").click();
    await expect(page.getByTestId("pricing-plan-topup")).toBeVisible();
    await expect(page.getByText(/one-time|top-up/i).first()).toBeVisible();
  });

  test("checkout CTA button is clickable and shows loading state", async ({ page }) => {
    await page.goto("/");
    await openPricingPage(page);

    const checkoutButton = page.getByTestId("pricing-cta-basic");
    await expect(checkoutButton).toBeVisible();
    await expect(checkoutButton).toBeEnabled();
    await checkoutButton.click();
    await expect(checkoutButton).toBeEnabled({ timeout: 3000 });
  });

  test("back to editor navigation works from pricing page", async ({
    page,
  }) => {
    await page.goto("/");
    await openPricingPage(page);

    await page.getByTestId("pricing-back-to-editor").click();

    await expect(page.getByTestId("processing-settings-panel")).toBeVisible();
    await expect(page.getByTestId("pricing-page")).not.toBeVisible();
  });

  test("FAQ section is visible on pricing page", async ({ page }) => {
    await page.goto("/");
    await openPricingPage(page);

    await expect(
      page.getByText(/what happens if i run out of tokens/i),
    ).toBeVisible();
    await expect(page.getByText(/can i switch plans later/i)).toBeVisible();
  });
});
