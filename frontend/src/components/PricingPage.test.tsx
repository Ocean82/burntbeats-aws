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
});
