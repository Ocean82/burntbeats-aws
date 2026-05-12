import { test, expect, type Page, type Route } from "@playwright/test";
import { minimalWavBuffer, skipOnboarding } from "./fixtures/helpers";

/**
 * Stem split flow integration tests.
 *
 * Runs in VITE_LOCAL_DEV_FULL_APP=1 mode (no real Clerk auth, subscription treated as Premium).
 * All API calls are intercepted — no real backend or stem service needed.
 */

/** Mock a successful split: upload accepted → SSE progress → completed with 2 stems. */
async function mockSplitSuccess(page: Page) {
  // Intercept the split upload endpoint (returns 202 with job_id)
  await page.route("**/api/stems/split", async (route: Route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "mock-job-e2e-001",
        job_token: "tok_e2e_mock",
      }),
    });
  });

  // Intercept the SSE stream endpoint — return progress then completed
  await page.route(
    "**/api/stems/status/mock-job-e2e-001/stream",
    async (route: Route) => {
      const sseBody = [
        `data: ${JSON.stringify({ status: "running", progress: 25 })}\n\n`,
        `data: ${JSON.stringify({ status: "running", progress: 50 })}\n\n`,
        `data: ${JSON.stringify({ status: "running", progress: 75 })}\n\n`,
        `data: ${JSON.stringify({
          status: "completed",
          progress: 100,
          stems: [
            { id: "vocals", url: "/mock-stems/vocals.wav" },
            { id: "instrumental", url: "/mock-stems/instrumental.wav" },
          ],
        })}\n\n`,
      ].join("");

      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: sseBody,
      });
    },
  );

  // Intercept polling fallback (in case SSE fails)
  await page.route(
    "**/api/stems/status/mock-job-e2e-001",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          progress: 100,
          stems: [
            { id: "vocals", url: "/mock-stems/vocals.wav" },
            { id: "instrumental", url: "/mock-stems/instrumental.wav" },
          ],
        }),
      });
    },
  );

  // Intercept stem audio file requests (return minimal audio)
  await page.route("**/mock-stems/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: minimalWavBuffer(),
    });
  });
}

/** Mock a failed split: upload accepted → SSE returns error. */
async function mockSplitFailure(page: Page) {
  await page.route("**/api/stems/split", async (route: Route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "mock-job-e2e-fail",
        job_token: "tok_e2e_fail",
      }),
    });
  });

  await page.route(
    "**/api/stems/status/mock-job-e2e-fail/stream",
    async (route: Route) => {
      const sseBody = [
        `data: ${JSON.stringify({ status: "running", progress: 30 })}\n\n`,
        `data: ${JSON.stringify({
          status: "failed",
          progress: 30,
          error: "Model inference failed: out of memory",
        })}\n\n`,
      ].join("");

      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      });
    },
  );

  await page.route(
    "**/api/stems/status/mock-job-e2e-fail",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "failed",
          progress: 30,
          error: "Model inference failed: out of memory",
        }),
      });
    },
  );
}

test.describe("Stem split flow", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("upload enables the split button with token cost", async ({ page }) => {
    await page.goto("/");
    const panel = page.getByTestId("processing-settings-panel");
    await expect(panel).toBeVisible();

    // No split button before upload
    await expect(panel.locator("button.fire-button")).toHaveCount(0);

    // Upload a file
    await page.getByLabel("Choose audio file").setInputFiles({
      name: "test-song.wav",
      mimeType: "audio/wav",
      buffer: minimalWavBuffer(),
    });

    // Split button should appear and be enabled
    const splitButton = panel.locator("button.fire-button").first();
    await expect(splitButton).toBeEnabled();
  });

  test("split request fires on button click", async ({ page }) => {
    let splitRequested = false;
    await page.route("**/api/stems/split", async (route: Route) => {
      splitRequested = true;
      // Return 202 to acknowledge the split
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "mock-job-request-test",
          job_token: "tok_req",
        }),
      });
    });

    // Also mock the status endpoint so the app doesn't hang
    await page.route("**/api/stems/status/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "running", progress: 10 }),
      });
    });

    await page.goto("/");

    // Upload file
    await page.getByLabel("Choose audio file").setInputFiles({
      name: "test-song.wav",
      mimeType: "audio/wav",
      buffer: minimalWavBuffer(),
    });

    // Click split
    const splitButton = page
      .getByTestId("processing-settings-panel")
      .locator("button.fire-button")
      .first();
    await splitButton.click();

    // Verify the API was called
    await expect
      .poll(() => splitRequested, { timeout: 10_000 })
      .toBe(true);
  });

  test("progress UI appears during split", async ({ page }) => {
    await mockSplitSuccess(page);
    await page.goto("/");

    // Upload file
    await page.getByLabel("Choose audio file").setInputFiles({
      name: "test-song.wav",
      mimeType: "audio/wav",
      buffer: minimalWavBuffer(),
    });

    // Click split
    await page
      .getByTestId("processing-settings-panel")
      .locator("button.fire-button")
      .first()
      .click();

    // Status should show "Splitting…" during the process
    await expect(page.getByText(/splitting/i)).toBeVisible({ timeout: 10_000 });
  });

  test("stems appear in mixer after successful split", async ({ page }) => {
    await mockSplitSuccess(page);
    await page.goto("/");

    // Upload and split
    await page.getByLabel("Choose audio file").setInputFiles({
      name: "test-song.wav",
      mimeType: "audio/wav",
      buffer: minimalWavBuffer(),
    });

    await page
      .getByTestId("processing-settings-panel")
      .locator("button.fire-button")
      .first()
      .click();

    // After split completes, the "Splitting…" status should disappear
    // and stem labels (vocals, instrumental) should appear in the UI.
    // Wait for the splitting indicator to go away first.
    await expect(page.getByText(/splitting/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/splitting/i)).not.toBeVisible({
      timeout: 20_000,
    });

    // Stem labels should be visible somewhere in the page (mixer, waveform lanes, etc.)
    await expect(
      page.getByText(/vocals/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("error state shown on split failure", async ({ page }) => {
    await mockSplitFailure(page);
    await page.goto("/");

    // Upload and split
    await page.getByLabel("Choose audio file").setInputFiles({
      name: "test-song.wav",
      mimeType: "audio/wav",
      buffer: minimalWavBuffer(),
    });

    await page
      .getByTestId("processing-settings-panel")
      .locator("button.fire-button")
      .first()
      .click();

    // Error message should appear
    await expect(
      page.getByText(/failed|error|out of memory/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
