import { test, expect, type Page } from "@playwright/test";
import { skipOnboarding, E2E_APP_READY_MS } from "./fixtures/helpers";

async function openMidiEditor(page: Page) {
  await page.goto("/midi?e2e-midi-editor=1");
  await expect(page.getByTestId("midi-result-panel")).toBeVisible({
    timeout: E2E_APP_READY_MS,
  });

  const hideHealth = page.getByRole("button", {
    name: /hide internal health panel/i,
  });
  if (await hideHealth.isVisible().catch(() => false)) {
    await hideHealth.click({ force: true });
  }

  await expect(page.getByTestId("midi-note-editor")).toBeVisible({
    timeout: E2E_APP_READY_MS,
  });
}

test.describe("MIDI groove insert", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);

    await page.route("**/api/midi/rhythm/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/styles") || url.includes("/styles?")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            styles: [{ id: "rock", name: "rock", label: "Rock" }],
            variations: [],
          }),
        });
        return;
      }

      if (url.includes("/generate/json")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            filename: "rhythm_rock_120bpm_4bars.mid",
            midi_base64: "TVRoZA==",
            metadata: { style: "rock" },
          }),
        });
        return;
      }

      await route.continue();
    });
  });

  test("inserts groove via process dialog into a new track", async ({ page }) => {
    await openMidiEditor(page);

    const tracksBefore = await page.locator(".midi-track-strip").count();

    await page.getByRole("button", { name: "More tools" }).click();
    await page.getByTestId("midi-open-process-dialog").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("midi-rhythm-groove-panel")).toBeVisible();

    await page.getByTestId("midi-rhythm-insert-groove").click();

    await expect
      .poll(async () => await page.locator(".midi-track-strip").count())
      .toBeGreaterThan(tracksBefore);
  });
});
