import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PricingPage } from "./PricingPage";

describe("PricingPage", () => {
  const inactiveSub = {
    status: "inactive" as const,
    plan: null,
    entitlementSource: "none" as const,
    capabilities: {
      canSplitFourStems: false,
      canExpandToFourStems: false,
      canUsePremiumStemQualities: false,
      canUseBatchQueue: false,
      canDownloadFullPreview: false,
      canShareCleanPreview: false,
    },
    billingError: null,
    billingStatus: "none" as const,
    startCheckout: vi.fn(() => Promise.resolve()),
    openPortal: vi.fn(() => Promise.resolve()),
    refetch: vi.fn(),
  };

  it("starts checkout when a visible plan price is clicked", () => {
    const startCheckout = vi.fn(() => Promise.resolve());

    render(
      <PricingPage
        subscription={{ ...inactiveSub, startCheckout }}
        onClose={vi.fn()}
      />,
    );

    // Price text appears in both desktop and mobile card renders;
    // use the testid to target the interactive price button.
    const priceButtons = screen.getAllByTestId("pricing-price-premium");
    fireEvent.click(priceButtons[0]);

    expect(startCheckout).toHaveBeenCalledWith("premium", {
      source: "pricing_page",
      intent: "pricing_page_cta",
      interval: "year",
    });
  });

  it("shows the current plan state and does not restart checkout for it", () => {
    const startCheckout = vi.fn(() => Promise.resolve());

    render(
      <PricingPage
        subscription={{
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
          billingError: null,
          billingStatus: "active",
          startCheckout,
          openPortal: vi.fn(() => Promise.resolve()),
          refetch: vi.fn(),
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/current plan/i).length).toBeGreaterThan(0);

    const priceElements = screen.getAllByTestId("pricing-price-premium");
    fireEvent.click(priceElements[0]);

    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("uses workflow-oriented copy for subscriptions and credit packs", () => {
    render(<PricingPage subscription={inactiveSub} onClose={vi.fn()} />);

    // Descriptions render in both desktop and mobile card variants;
    // use getAllByText and assert at least one match.
    expect(
      screen.getAllByText(/full browser workstation/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/speed-mode 2-stem splits/i).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("pricing-tab-credit-packs"));

    expect(
      screen.getAllByText(/one-time credits for occasional sessions/i).length,
    ).toBeGreaterThan(0);
  });
});
