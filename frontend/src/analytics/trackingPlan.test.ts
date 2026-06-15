import { describe, expect, it } from "vitest";
import { GA4_CONVERSION_EVENTS, GA4_EVENT_NAMES } from "./trackingPlan";

describe("GA4 tracking plan", () => {
  it("marks core funnel events as GA4 conversions", () => {
    expect(GA4_CONVERSION_EVENTS).toEqual(
      expect.arrayContaining([
        "signup_completed",
        "checkout_started",
        "checkout_returned_success",
        "split_started",
        "export_completed",
      ]),
    );
  });

  it("includes billing checkout return events", () => {
    expect(GA4_EVENT_NAMES.has("checkout_returned_success")).toBe(true);
    expect(GA4_EVENT_NAMES.has("checkout_returned_cancelled")).toBe(true);
  });
});
