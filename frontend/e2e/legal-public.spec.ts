import { test, expect } from "@playwright/test";

/**
 * Public legal routes bypass auth (Root.tsx → LegalPage).
 * Helps GA4/TikTok “policy URL must be reachable” style checks stay green in CI without Clerk.
 */
test.describe("Legal pages (public, no Clerk)", () => {
  test("privacy policy renders", async ({ page }) => {
    await page.goto("/privacy-policy");
    // Markdown body also emits h1 — anchor on the LegalPage chrome heading (direct child of article).
    await expect(page.locator("article > h1")).toHaveText(/privacy policy/i);
  });

  test("terms of service renders", async ({ page }) => {
    await page.goto("/terms-of-service");
    await expect(page.locator("article > h1")).toHaveText(/terms of service/i);
  });
});
