import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("Burnt Beats app (local full app mode)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("burnt-beats-onboarding-complete", "true");
    });
  });

  test("source panel visible; split disabled without upload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("source-panel")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Split a track or load stems to mix/i })
    ).toBeVisible();
    await expect(page.getByTestId("split-generate-button")).toBeDisabled();
  });

  test("mixer prompts before stems exist", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/Split a track or load stems to start mixing and exporting/i)
    ).toBeVisible();
  });

  test("separation mode radios are available before split", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("radio", { name: /2-stem fast/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /2-stem quality/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /2-stem ultra/i })).toBeVisible();
  });

  test("file input for upload exists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Choose audio file")).toBeAttached();
  });
});
