import { describe, expect, it, vi } from "vitest";
import { trackCheckoutReturnedOnce } from "./checkoutTracking";

describe("trackCheckoutReturnedOnce", () => {
  it("fires checkout_returned_success only once per session", () => {
    const gtag = vi.fn();
    vi.stubGlobal("gtag", gtag);
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    });

    trackCheckoutReturnedOnce("success", "test");
    trackCheckoutReturnedOnce("success", "test");

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "checkout_returned_success", {
      source: "test",
    });
  });
});
