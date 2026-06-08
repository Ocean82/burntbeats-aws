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
  await expect(page.getByTestId("midi-e2e-controls")).toBeVisible();
}

function noteLocators(page: Page) {
  return page.locator('svg rect[data-testid^="midi-note-"]');
}

async function noteWidth(page: Page, index = 0) {
  const box = await noteLocators(page).nth(index).boundingBox();
  return box?.width ?? 0;
}

test.describe("MIDI editor interactions", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test("marquee-selects multiple notes", async ({ page }) => {
    await openMidiEditor(page);

    await page.getByTestId("e2e-marquee-select").click();

    await expect(page.getByText("2 selected")).toBeVisible();
  });

  test("Alt-drag duplicates a note", async ({ page }) => {
    await openMidiEditor(page);

    const notes = noteLocators(page);
    const beforeCount = await notes.count();

    await page.getByTestId("e2e-alt-duplicate").click();

    await expect
      .poll(async () => await noteLocators(page).count())
      .toBe(beforeCount + 1);
  });

  test("resizes a note from the right edge", async ({ page }) => {
    await openMidiEditor(page);

    const beforeWidth = await noteWidth(page, 0);

    await page.getByTestId("e2e-resize-first").click();

    await expect
      .poll(async () => await noteWidth(page, 0))
      .toBeGreaterThan(beforeWidth + 1);
  });

  test("opens context menu and deletes a note", async ({ page }) => {
    await openMidiEditor(page);

    const notes = noteLocators(page);
    const beforeCount = await notes.count();

    await page.getByTestId("e2e-open-context-menu").click();
    await expect(
      page.getByRole("menu", { name: "Piano roll context menu" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect
      .poll(async () => await noteLocators(page).count())
      .toBe(beforeCount - 1);
  });
});
