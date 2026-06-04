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

/** Open the stem editor and wait until the processing panel is interactive. */
export async function gotoEditor(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("processing-settings-panel")).toBeVisible({
    timeout: E2E_APP_READY_MS,
  });
}

/** Open the library view and wait for the catalog shell. */
export async function gotoLibrary(page: import("@playwright/test").Page) {
  await page.goto("/library");
  await expect(page.getByTestId("library-page")).toBeVisible({
    timeout: E2E_APP_READY_MS,
  });
}

/** Open in-app pricing via Settings → Plans & subscriptions. */
export async function openPricingPage(page: import("@playwright/test").Page) {
  await page.getByTestId("settings-menu-trigger").click();
  await page.getByTestId("settings-menu-pricing").click();
  await page.getByTestId("pricing-page").waitFor();
}
