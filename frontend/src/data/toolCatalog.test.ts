import { describe, expect, it } from "vitest";
import {
  BACK_TO_HOME_LABEL,
  getHeaderTools,
  getPrimaryTools,
  getSecondaryTools,
  getTool,
  TOOL_CATALOG,
} from "./toolCatalog";

describe("toolCatalog", () => {
  it("has unique catalog ids and valid routes", () => {
    const ids = TOOL_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tool of TOOL_CATALOG) {
      expect(tool.route.startsWith("/")).toBe(true);
      expect(tool.primaryName.length).toBeGreaterThan(0);
      expect(tool.headerTabLabel.length).toBeGreaterThan(0);
    }
  });

  it("exposes three primary hub tools", () => {
    const primary = getPrimaryTools();
    expect(primary).toHaveLength(3);
    expect(primary.map((t) => t.id)).toEqual(["editor", "beats", "midi"]);
  });

  it("exposes four secondary hub tools", () => {
    const secondary = getSecondaryTools();
    expect(secondary).toHaveLength(4);
    expect(secondary.map((t) => t.id)).toEqual([
      "speech",
      "tuner",
      "patterns",
      "my-stems",
    ]);
  });

  it("routes beat templates to drum machine with patterns focus", () => {
    expect(getTool("patterns").route).toBe("/beats?tab=drums&focus=patterns");
  });

  it("includes tuner in header tools", () => {
    const headerIds = getHeaderTools().map((t) => t.id);
    expect(headerIds).toContain("tuner");
    expect(headerIds).toContain("my-stems");
  });

  it("uses human-friendly back label", () => {
    expect(BACK_TO_HOME_LABEL).toBe("Back to Home");
  });
});
