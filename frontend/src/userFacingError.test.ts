import { describe, expect, it } from "vitest";
import { isLikelySafeUserFacingErrorText } from "./userFacingError";

describe("isLikelySafeUserFacingErrorText", () => {
  it("rejects stack-like strings and paths", () => {
    expect(isLikelySafeUserFacingErrorText("Error: boom\n    at foo (/var/app/server.js:12)")).toBe(false);
    expect(isLikelySafeUserFacingErrorText("<!DOCTYPE html><html>")).toBe(false);
  });

  it("allows short deliberate API-style messages", () => {
    expect(isLikelySafeUserFacingErrorText("stems must be '2' or '4'")).toBe(true);
    expect(isLikelySafeUserFacingErrorText("Please sign in again.")).toBe(true);
  });

  it("rejects oversized strings", () => {
    expect(isLikelySafeUserFacingErrorText("x".repeat(300))).toBe(false);
  });
});
