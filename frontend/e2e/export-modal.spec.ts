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
});
