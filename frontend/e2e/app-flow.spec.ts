import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";

/** Tiny valid WAV (PCM mono) — enough for File + duration hooks; avoids bundling binary fixtures. */
function minimalWavBuffer(): Buffer {
  const sampleRate = 8000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const numSamples = 16;
  const dataSize = numSamples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

test.describe.configure({ mode: "serial" });

test.describe("Burnt Beats app (local full app mode)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("burnt-beats-onboarding-complete", "true");
    });
  });

  test("processing settings visible; split CTA appears after upload and is enabled", async ({
    page,
  }) => {
    await page.goto("/");
    const panel = page.getByTestId("processing-settings-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("split-upload-dropzone")).toBeVisible();
    // Progressive disclosure: no primary split row until a file is selected (see ProcessingSettingsPanel).
    await expect(panel.locator("button.fire-button")).toHaveCount(0);

    await page.getByLabel("Choose audio file").setInputFiles({
      name: "e2e-tiny.wav",
      mimeType: "audio/wav",
      buffer: minimalWavBuffer(),
    });

    await expect(panel.locator("button.fire-button").first()).toBeEnabled();
  });

  test("mixer prompts before stems exist", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/Split a track or load stem files above to start mixing and exporting/i),
    ).toBeVisible();
  });

  test("quality and stem controls are available in Load mode without upload", async ({
    page,
  }) => {
    await page.goto("/");
    // Substring "load" matches "Upload a track" — require exact label for Split/Load toggle.
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Number of stems" })).toBeVisible();
  });

  test("file input for upload exists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Choose audio file")).toBeAttached();
  });

  test("skip link moves focus to main content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("processing-settings-panel")).toBeVisible({ timeout: 20_000 });

    const skip = page.getByRole("link", { name: "Skip to main content" });
    const main = page.locator("#main-content");

    await expect(main).toHaveAttribute("tabindex", "-1");
    await skip.focus();
    await expect(skip).toBeFocused();
    await skip.click();
    await expect(main).toBeFocused();
  });
});
