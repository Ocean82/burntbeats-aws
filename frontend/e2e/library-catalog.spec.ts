import { test, expect } from "@playwright/test";

test.describe("Library catalog", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("burnt-beats-onboarding-complete", "true");
      localStorage.setItem("burntbeats_cookie_consent", "declined");
    });

    await page.route("**/api/catalog/midi**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 1,
          offset: 0,
          limit: 50,
          entries: [
            {
              id: "demo-progression-1",
              title: "Warm Embers Progression",
              filename: "warm-embers.mid",
              category: {
                type: "progression",
                genre: "rock",
                key: "Am",
                time_signature: "4/4",
                complexity: "medium",
                tempo: "120",
              },
              analysis: {
                estimatedTempo: 120,
                length: 4,
                track_count: 1,
                note_count: 32,
              },
              tags: ["progression"],
            },
          ],
          statistics: { total_entries: 1, by_genre: { rock: 1 } },
        }),
      });
    });
  });

  test("library page loads catalog and shows browse results", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByTestId("library-page")).toBeVisible();
    await expect(page.getByText("Warm Embers Progression")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("library catalog filter bar is accessible", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("searchbox", { name: /search catalog/i })).toBeVisible();
  });
});
