import { describe, expect, it } from "vitest";
import {
  NO_SUBSCRIPTION_CAPABILITIES,
  resolveCapabilitiesFromSubscription,
} from "./useSubscription";

describe("resolveCapabilitiesFromSubscription", () => {
  it("grants premium caps for studio when legacy API omits capabilities", () => {
    const caps = resolveCapabilitiesFromSubscription({
      active: true,
      plan: "studio",
    });
    expect(caps.canSplitFourStems).toBe(true);
    expect(caps.canUsePremiumStemQualities).toBe(true);
    expect(caps.canExpandToFourStems).toBe(true);
  });

  it("keeps basic limited when capabilities omitted", () => {
    const caps = resolveCapabilitiesFromSubscription({
      active: true,
      plan: "basic",
    });
    expect(caps).toEqual(NO_SUBSCRIPTION_CAPABILITIES);
  });

  it("respects explicit false capabilities from API", () => {
    const caps = resolveCapabilitiesFromSubscription({
      active: true,
      plan: "studio",
      capabilities: { canSplitFourStems: false },
    });
    expect(caps.canSplitFourStems).toBe(false);
  });
});
