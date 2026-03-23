import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, ".env.local"), quiet: true });

/** Non-empty placeholder so Vite can boot if `.env` is missing (Clerk may warn; full app mode skips sign-in). */
const clerkFallback =
  "pk_test_0000000000000000000000000000000000000000000000000000000000000000";

/** When Playwright starts Vite itself, use a port that usually does not clash with `npm run dev` (5173). */
const DEFAULT_DEV_PORT = "5180";

function normalizeBaseURL(url: string): string {
  return url.replace(/\/$/, "");
}

/** Where Playwright opens pages (`page.goto('/')`). Defaults to `http://127.0.0.1:5180` when Playwright spawns Vite (see `DEFAULT_DEV_PORT`). */
const playwrightBaseURL = normalizeBaseURL(
  process.env.PLAYWRIGHT_BASE_URL ??
    `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? DEFAULT_DEV_PORT}`
);

/** Port for `npm run dev -- --port …` when Playwright starts the server (must match `playwrightBaseURL`). */
function devPortForWebServer(): string {
  try {
    const u = new URL(playwrightBaseURL);
    if (u.port) return u.port;
  } catch {
    /* fall through */
  }
  return process.env.PLAYWRIGHT_PORT ?? DEFAULT_DEV_PORT;
}

/**
 * E2E runs against Vite dev server with `VITE_LOCAL_DEV_FULL_APP=1` so the full
 * stem app loads without Clerk sign-in (see `src/config.ts` + `Root.tsx`).
 *
 * Pointing at your dev server:
 * - Set `PLAYWRIGHT_BASE_URL` (e.g. `http://127.0.0.1:5173`) so tests and `webServer` use the same origin.
 * - Or set `PLAYWRIGHT_PORT` only (default host `127.0.0.1`).
 * - Default: Playwright **starts** a dev server on `PLAYWRIGHT_BASE_URL` with `VITE_LOCAL_DEV_FULL_APP=1`
 *   (avoids attaching to a wrong/stale process on the same port).
 * - To use your already-running `npm run dev` instead: set `PLAYWRIGHT_REUSE_SERVER=1` and the same
 *   `PLAYWRIGHT_BASE_URL` / port as that server (and `VITE_LOCAL_DEV_FULL_APP=1` in that shell).
 * Prefer a real `VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env` (copy from `.env.example`).
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: playwrightBaseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${devPortForWebServer()}`,
    url: playwrightBaseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    env: {
      ...process.env,
      VITE_LOCAL_DEV_FULL_APP: "1",
      VITE_CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY ?? clerkFallback,
      VITE_STRIPE_PUBLISHABLE_KEY: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? clerkFallback,
    },
    timeout: 120_000,
  },
});
