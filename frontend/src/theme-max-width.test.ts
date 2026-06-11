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

    const cssFiles = readdirSync(assetsDir).filter((name) => name.endsWith(".css"));
    if (cssFiles.length === 0) return;

    // Vite emits multiple CSS chunks; max-w-* lives in the main index bundle, not
    // route-specific chunks (e.g. MidiConvertPage). Scan all built CSS.
    const css = cssFiles
      .map((name) => readFileSync(resolve(assetsDir, name), "utf8"))
      .join("\n");
    expect(css).toContain(".max-w-md{max-width:var(--max-width-md)}");
    expect(css).not.toContain(".max-w-md{max-width:var(--spacing-md)}");
  });
});
