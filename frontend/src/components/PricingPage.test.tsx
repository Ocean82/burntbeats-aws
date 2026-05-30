import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PricingPage } from "./PricingPage";

describe("PricingPage", () => {
  it("starts checkout when a visible plan price is clicked", () => {
    const startCheckout = vi.fn(() => Promise.resolve());

    render(
      <PricingPage
        subscription={{
          status: "inactive",
          plan: null,
          entitlementSource: "none",
          capabilities: {
            canSplitFourStems: false,
            canExpandToFourStems: false,
            canUsePremiumStemQualities: false,
            canUseBatchQueue: false,
            canDownloadFullPreview: false,
            canShareCleanPreview: false,
          },
          billingError: null,
          startCheckout,
          openPortal: vi.fn(() => Promise.resolve()),
          refetch: vi.fn(),
        }}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("$15/month"));

    expect(startCheckout).toHaveBeenCalledWith("premium", {
      source: "pricing_page",
      intent: "pricing_page_cta",
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
          startCheckout,
          openPortal: vi.fn(() => Promise.resolve()),
          refetch: vi.fn(),
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/current plan/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("pricing-price-premium"));

    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("uses workflow-oriented copy for subscriptions and credit packs", () => {
    render(
      <PricingPage
        subscription={{
          status: "inactive",
          plan: null,
          entitlementSource: "none",
          capabilities: {
            canSplitFourStems: false,
            canExpandToFourStems: false,
            canUsePremiumStemQualities: false,
            canUseBatchQueue: false,
            canDownloadFullPreview: false,
            canShareCleanPreview: false,
          },
          billingError: null,
          startCheckout: vi.fn(() => Promise.resolve()),
          openPortal: vi.fn(() => Promise.resolve()),
          refetch: vi.fn(),
        }}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/workstation ready whenever a track needs a first pass/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/building edits, remixes, and repeat sessions every week/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pricing-tab-credit-packs"));

    expect(
      screen.getByText(/open the workstation when you need stems, without a monthly plan/i),
    ).toBeInTheDocument();
  });
});
