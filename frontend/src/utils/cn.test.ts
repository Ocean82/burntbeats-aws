import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles conditional classes", () => {
    const showHidden = false;
    const showVisible = true;
    expect(cn("base", showHidden && "hidden", showVisible && "visible")).toBe("base visible");
  });

  it("deduplicates Tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
