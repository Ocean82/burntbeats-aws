import { test, expect } from "@playwright/test";

/**
 * Smoke: catalog browse → open MIDI tool (edit path entry point).
 * Full server-side convert/export is covered by unit tests and export-modal e2e.
 */
test.describe("Catalog to MIDI workflow smoke", () => {
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
              id: "smoke-progression-1",
              title: "Smoke Test Progression",
              filename: "smoke.mid",
              category: {
                type: "progression",
                genre: "pop",
                key: "C",
                time_signature: "4/4",
                complexity: "easy",
                tempo: "100",
              },
              analysis: {
                estimatedTempo: 100,
                length: 4,
                track_count: 1,
                note_count: 16,
              },
              tags: ["smoke"],
            },
          ],
          statistics: { total_entries: 1, by_genre: { pop: 1 } },
        }),
      });
    });
  });

  test("browse library then navigate to MIDI convert", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByText("Smoke Test Progression")).toBeVisible({
      timeout: 10_000,
    });

    await page
      .getByLabel("Workspace tabs")
      .getByRole("button", { name: /MIDI/i })
      .click();
    await expect(page.getByTestId("midi-convert-panel")).toBeVisible({
      timeout: 10_000,
    });
  });
});
