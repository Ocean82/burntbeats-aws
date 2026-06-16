import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppSubscription } from "./useAppSubscription";
import { useSubscription } from "./useSubscription";
import { useUsageBalance } from "./useUsageBalance";

vi.mock("./useSubscription", () => ({
  useSubscription: vi.fn(),
}));

vi.mock("./useUsageBalance", () => ({
  useUsageBalance: vi.fn(),
}));

vi.mock("./usePostSignupPlanCheckout", () => ({
  usePostSignupPlanCheckout: vi.fn(),
}));

const mockedUseSubscription = vi.mocked(useSubscription);
const mockedUseUsageBalance = vi.mocked(useUsageBalance);

describe("useAppSubscription", () => {
  beforeEach(() => {
    mockedUseUsageBalance.mockReturnValue({
      balance: 12,
      periodEnd: null,
      paidBalance: 0,
      freeMonthlyRemaining: 12,
      welcomeGranted: false,
      loading: false,
      refetch: vi.fn(),
    });
  });

  it("fails closed for unknown active plans without premium capabilities", () => {
    mockedUseSubscription.mockReturnValue({
      status: "active",
      plan: "unknown",
      entitlementSource: "subscription",
      capabilities: {
        canSplitFourStems: false,
        canExpandToFourStems: false,
        canUsePremiumStemQualities: false,
        canUseBatchQueue: false,
        canDownloadFullPreview: false,
        canShareCleanPreview: false,
      },
      billingStatus: "none",
      billingError: null,
      startCheckout: vi.fn(),
      openPortal: vi.fn(),
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useAppSubscription({
        localDevFullApp: false,
        splitResultStemsLength: 0,
      }),
    );

    expect(result.current.stemQualityOptions).toBe("speed_only");
    expect(result.current.canSplitFourStems).toBe(false);
    expect(result.current.canExpandToFourStems).toBe(false);
    expect(result.current.canUseBatchQueue).toBe(false);
  });

  it("exposes premium stem features from backend capabilities", () => {
    mockedUseSubscription.mockReturnValue({
      status: "active",
      plan: "premium",
      entitlementSource: "subscription",
      capabilities: {
        canSplitFourStems: true,
        canExpandToFourStems: true,
        canUsePremiumStemQualities: true,
        canUseBatchQueue: true,
        canDownloadFullPreview: true,
        canShareCleanPreview: true,
      },
      billingStatus: "active",
      billingError: null,
      startCheckout: vi.fn(),
      openPortal: vi.fn(),
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useAppSubscription({
        localDevFullApp: false,
        splitResultStemsLength: 2,
      }),
    );

    expect(result.current.stemQualityOptions).toBe("full");
    expect(result.current.canSplitFourStems).toBe(true);
    expect(result.current.canExpandToFourStems).toBe(true);
    expect(result.current.canUseBatchQueue).toBe(true);
  });
});
