import { test, expect } from "@playwright/test";

test.describe("Onboarding polish (design tokens)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("burnt-beats-onboarding-complete");
    });
  });

  test("onboarding dialog uses semantic tokens and modal z-index", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: /welcome to burnt beats/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(dialog).toHaveClass(/bg-popover/);
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveClass(/text-foreground/);
    await expect(dialog.locator("[class*='amber']")).toHaveCount(0);

    await expect(page.locator(".z-modal-backdrop").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /get started|next/i }).first()).toBeVisible();
  });
});
