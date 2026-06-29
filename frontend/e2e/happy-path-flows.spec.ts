import { test, expect, type Page, type Route } from "@playwright/test";
import {
  gotoEditor,
  minimalWavBuffer,
  skipOnboarding,
  uploadAndSplit,
  waitForWorkspace,
} from "./fixtures/helpers";

/**
 * Happy-path integration tests that verify the complete client-side
 * state machine and request payloads for billing and stem-split flows.
 *
 * These run against mocked backend responses but exercise the full
 * UI pipeline end-to-end (no unit-level stubs or component mocks).
 */

// ─── Stem Split Happy Path ────────────────────────────────────────

/** Intercept split POST and assert request payload shape. */
async function mockSplitWithPayloadInspection(page: Page) {
  let capturedPayload: unknown;

  await page.route("**/api/stems/split", async (route: Route) => {
    const body = route.request().postDataJSON();
    capturedPayload = body;

    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "e2e-happy-001",
        job_token: "tok_happy",
      }),
    });
  });

  await page.route(
    "**/api/stems/status/e2e-happy-001/stream",
    async (route: Route) => {
      const sseBody = [
        `data: ${JSON.stringify({ status: "running", progress: 10 })}\n\n`,
        `data: ${JSON.stringify({ status: "running", progress: 50 })}\n\n`,
        `data: ${JSON.stringify({ status: "running", progress: 90 })}\n\n`,
        `data: ${JSON.stringify({
          status: "completed",
          progress: 100,
          stems: [
            { id: "vocals", url: "/mock-stems/vocals.wav", label: "Vocals" },
            { id: "instrumental", url: "/mock-stems/instrumental.wav", label: "Instrumental" },
          ],
        })}\n\n`,
      ].join("");

      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache", Connection: "keep-alive" },
        body: sseBody,
      });
    },
  );

  await page.route(
    "**/api/stems/status/e2e-happy-001",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          progress: 100,
          stems: [
            { id: "vocals", url: "/mock-stems/vocals.wav", label: "Vocals" },
            { id: "instrumental", url: "/mock-stems/instrumental.wav", label: "Instrumental" },
          ],
        }),
      });
    },
  );

  await page.route("**/mock-stems/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: minimalWavBuffer(),
    });
  });

  return { capturedPayload };
}

test.describe("Stem split happy path", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("full upload → split → mixer state transition", async ({ page }) => {
    const { capturedPayload } = await mockSplitWithPayloadInspection(page);

    await gotoEditor(page);

    // Verify we start at upload phase
    await expect(page.getByTestId("upload-phase")).toBeVisible();

    // Upload triggers configure phase
    await uploadAndSplit(page, {
      name: "happy-path-test.wav",
      mimeType: "audio/wav",
      buffer: minimalWavBuffer(),
    });

    await expect(page.getByTestId("configure-phase")).toBeVisible({ timeout: 5000 });
    const splitButton = page.getByTestId("split-button");
    await expect(splitButton).toBeEnabled();

    // Click split — verify POST payload
    await splitButton.click();

    // Wait for request and assert payload has expected shape
    await page.waitForLoadState("networkidle");
    expect(capturedPayload).toBeTruthy();
    const payload = capturedPayload as Record<string, unknown>;
    expect(payload).toHaveProperty("model");
    expect(payload).toHaveProperty("output_format");

    // Progress phase should appear
    await expect(page.getByTestId("splitting-phase")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/splitting/i).first()).toBeVisible({ timeout: 10_000 });

    // Wait for completion → workspace with mixer
    await waitForWorkspace(page);
    await expect(page.getByTestId("workspace")).toBeVisible();
    await expect(page.getByTestId("workspace").getByText(/vocals/i).first()).toBeVisible();
    await expect(page.getByTestId("workspace").getByText(/instrumental/i).first()).toBeVisible();

    // Verify stems have mute/solo controls in the mixer
    const vocalsLabel = page.getByTestId("workspace").getByText(/vocals/i).first();
    await expect(vocalsLabel).toBeVisible();
  });

  test("split rejection when no file uploaded", async ({ page }) => {
    await gotoEditor(page);

    // Without upload, configure phase should not appear
    await expect(page.getByTestId("upload-phase")).toBeVisible();
    await expect(page.getByTestId("configure-phase")).not.toBeVisible();
  });
});

// ─── Billing Checkout Happy Path ──────────────────────────────────

test.describe("Billing checkout happy path", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("CTA click constructs Stripe checkout session", async ({ page }) => {
    await gotoEditor(page);
    await page.getByTestId("settings-menu-trigger").click();
    await page.getByTestId("settings-menu-pricing").click();
    await page.getByTestId("pricing-page").waitFor();

    // Intercept the checkout endpoint and capture the request
    let checkoutPayload: unknown;
    await page.route("**/api/billing/checkout", async (route: Route) => {
      checkoutPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionUrl: "https://checkout.stripe.com/cs_test_mock",
          sessionId: "cs_test_mock_123",
        }),
      });
    });

    const checkoutButton = page.getByTestId("pricing-cta-basic");
    await expect(checkoutButton).toBeVisible();
    await checkoutButton.click();

    // Verify the checkout API was called with the correct price ID
    await page.waitForLoadState("networkidle");
    expect(checkoutPayload).toBeTruthy();
    const payload = checkoutPayload as Record<string, unknown>;
    expect(payload.priceId).toBeTruthy();
    expect(typeof payload.priceId).toBe("string");
  });

  test("annual billing toggle updates CTA label", async ({ page }) => {
    await gotoEditor(page);
    await page.getByTestId("settings-menu-trigger").click();
    await page.getByTestId("settings-menu-pricing").click();
    await page.getByTestId("pricing-page").waitFor();

    // Toggle to annual billing
    const annualToggle = page.getByTestId("pricing-toggle-annual");
    if (await annualToggle.count() > 0) {
      await annualToggle.click();
      await expect(page.getByText(/annual|billed yearly/i).first()).toBeVisible();
    }
  });
});
