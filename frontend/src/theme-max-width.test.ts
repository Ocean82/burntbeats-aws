import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against Tailwind v4 max-w-* / --spacing-* name collision.
 * max-w-md must not resolve to --spacing-md (16px).
 */
describe("theme max-width tokens", () => {
  it("defines explicit --max-width-md in index.css", () => {
    const css = readFileSync(resolve(__dirname, "index.css"), "utf8");
    expect(css).toMatch(/--max-width-md:\s*28rem/);
  });

  it("uses --max-width-md in built CSS when dist is present", () => {
    const assetsDir = resolve(__dirname, "../dist/assets");
    if (!existsSync(assetsDir)) return;

    const cssFile = readdirSync(assetsDir).find((name) => name.endsWith(".css"));
    if (!cssFile) return;

    const css = readFileSync(resolve(assetsDir, cssFile), "utf8");
    expect(css).toContain(".max-w-md{max-width:var(--max-width-md)}");
    expect(css).not.toContain(".max-w-md{max-width:var(--spacing-md)}");
  });
});
