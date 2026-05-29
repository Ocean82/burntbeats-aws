import { test, expect } from "@playwright/test";
import { minimalWavFile } from "./fixtures/minimal-wav";

test.describe("Export options modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("burnt-beats-onboarding-complete", "true");
      localStorage.setItem("burntbeats_cookie_consent", "declined");
    });
  });

  test("opens from mixer after loading stems; format targets expose pressed state", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByTestId("source-mode-load").click();
    await expect(page.getByTestId("load-upload-dropzone")).toBeVisible();

    await page.getByLabel("Load stem files", { exact: true }).setInputFiles([
      minimalWavFile("vocals.wav"),
      minimalWavFile("drums.wav"),
    ]);

    await expect(page.getByText(/2 stems loaded/i)).toBeVisible({ timeout: 10_000 });

    const exportBtn = page.getByRole("button", { name: "Export mix" });
    await expect(exportBtn).toBeEnabled({ timeout: 20_000 });
    await exportBtn.click();

    const dialog = page.getByRole("dialog", { name: /export options/i });
    await expect(dialog).toBeVisible();

    const wavOption = dialog.getByRole("button", { name: /^WAV/i });
    await expect(wavOption).toHaveAttribute("aria-pressed", "true");

    const mp3Option = dialog.getByRole("button", { name: /^MP3/i });
    await mp3Option.click();
    await expect(mp3Option).toHaveAttribute("aria-pressed", "true");
    await expect(wavOption).toHaveAttribute("aria-pressed", "false");

    const masterTarget = dialog.getByRole("button", { name: /master mix/i });
    await expect(masterTarget).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("mastering preset picker visible after split job completes", async ({ page }) => {
    const jobId = "mock-job-export-master";

    await page.route("**/api/master/presets**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          presets: [
            {
              id: "modern-rock",
              name: "Modern Rock",
              genre: "Rock",
              description: "Punchy rock master",
            },
          ],
        }),
      });
    });

    await page.route("**/api/stems/split", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: jobId,
          job_token: "tok_export_master",
        }),
      });
    });

    await page.route(`**/api/stems/status/${jobId}/stream`, async (route) => {
      const sseBody = [
        `data: ${JSON.stringify({ status: "running", progress: 50 })}\n\n`,
        `data: ${JSON.stringify({
          status: "completed",
          progress: 100,
          stems: [
            { id: "vocals", url: "/mock-stems/vocals.wav" },
            { id: "drums", url: "/mock-stems/drums.wav" },
          ],
        })}\n\n`,
      ].join("");
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      });
    });

    await page.route(`**/api/stems/status/${jobId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          progress: 100,
          stems: [
            { id: "vocals", url: "/mock-stems/vocals.wav" },
            { id: "drums", url: "/mock-stems/drums.wav" },
          ],
        }),
      });
    });

    await page.route("**/mock-stems/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: minimalWavFile("stem.wav"),
      });
    });

    await page.goto("/");
    await page.getByLabel("Choose audio file").setInputFiles(minimalWavFile("e2e-split.wav"));
    await page.getByRole("button", { name: /^split$/i }).click();

    const exportBtn = page.getByRole("button", { name: "Export mix" });
    await expect(exportBtn).toBeEnabled({ timeout: 20_000 });
    await exportBtn.click();

    const dialog = page.getByRole("dialog", { name: /export options/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Mastering preset")).toBeVisible();
    await expect(dialog.getByRole("option", { name: /Modern Rock/i })).toBeAttached();
  });
});
