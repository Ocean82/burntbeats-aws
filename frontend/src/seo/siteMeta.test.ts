import { describe, expect, it } from "vitest";
import { canonicalUrl, resolvePageMeta } from "./siteMeta";

describe("resolvePageMeta", () => {
  it("returns home metadata for /", () => {
    const meta = resolvePageMeta("/");
    expect(meta.path).toBe("/");
    expect(meta.title).toContain("Burnt Beats");
    expect(meta.indexable).not.toBe(false);
  });

  it("returns pricing metadata for /pricing", () => {
    const meta = resolvePageMeta("/pricing");
    expect(meta.path).toBe("/pricing");
    expect(meta.title).toContain("Pricing");
  });

  it("marks signed-out app paths as noindex", () => {
    const meta = resolvePageMeta("/midi");
    expect(meta.indexable).toBe(false);
  });

  it("marks unknown paths as noindex", () => {
    const meta = resolvePageMeta("/does-not-exist");
    expect(meta.indexable).toBe(false);
    expect(meta.title).toContain("Not Found");
  });
});

describe("canonicalUrl", () => {
  it("normalizes trailing slashes", () => {
    expect(canonicalUrl("/pricing/")).toBe("https://www.burntbeats.com/pricing");
    expect(canonicalUrl("/")).toBe("https://www.burntbeats.com/");
  });
});
