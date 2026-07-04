import { Buffer } from "node:buffer";
import { expect } from "@playwright/test";

/**
 * Tiny valid WAV (PCM mono, 8kHz, 16-bit) — enough for File + duration hooks.
 * Avoids bundling binary fixtures.
 */
export function minimalWavBuffer(): Buffer {
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

/** Default wait for lazy-loaded editor shell (Vite cold start under parallel workers). */
export const E2E_APP_READY_MS = 20_000;

/** Suppress onboarding tour and cookie banner so they don't block the editor. */
export function skipOnboarding(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    localStorage.setItem("burnt-beats-onboarding-complete", "true");
    localStorage.setItem("burntbeats_cookie_consent", "declined");
  });
}

/** Open the stem editor and wait until the transitional shell is interactive. */
export async function gotoEditor(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await expect(page.getByTestId("editor-app-shell")).toBeVisible({
    timeout: E2E_APP_READY_MS,
  });
}

/** Open the Beats view and wait for the page shell. */
export async function gotoBeats(page: import("@playwright/test").Page) {
  await page.goto("/beats");
  await expect(page.getByTestId("beats-page")).toBeVisible({
    timeout: E2E_APP_READY_MS,
  });
}

/** @deprecated Use gotoBeats */
export const gotoLibrary = gotoBeats;

/** Open in-app pricing via Settings → Plans & subscriptions. */
export async function openPricingPage(page: import("@playwright/test").Page) {
  await page.getByTestId("settings-menu-trigger").click();
  await page.getByTestId("settings-menu-pricing").click();
  await page.getByTestId("pricing-page").waitFor();
}

/** Wait until the transitional shell has entered the mixer workspace phase. */
export async function waitForWorkspace(
  page: import("@playwright/test").Page,
  timeout = 45_000,
) {
  await expect(page.getByTestId("splitting-phase")).toBeHidden({ timeout });
  await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 10_000 });
}

/**
 * Upload a WAV file and click the Split button.
 * Handles the full upload → configure → split transition.
 *
 * @param file - Either a `{name, mimeType, buffer}` object or a file path string.
 */
export async function uploadAndSplit(
  page: import("@playwright/test").Page,
  file:
    | string
    | { name: string; mimeType: string; buffer: Buffer },
) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(file);
  await expect(page.getByTestId("configure-phase")).toBeVisible({ timeout: 5000 });
  const splitButton = page.getByTestId("split-button");
  await splitButton.scrollIntoViewIfNeeded();
  // Use dispatchEvent to bypass any fixed overlay interception on mobile viewports
  await splitButton.dispatchEvent("click");
}
