import type { Page, Route } from "@playwright/test";
import { minimalWavBuffer } from "../fixtures/helpers";

/** Mock a successful split: upload accepted → SSE progress → completed with 2 stems. */
export async function mockSplitSuccess(page: Page) {
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

  await page.route("**/mock-stems/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: minimalWavBuffer(),
    });
  });
}
