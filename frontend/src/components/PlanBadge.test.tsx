import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanBadge } from "./PlanBadge";

describe("PlanBadge", () => {
  it("renders a pulse skeleton while loading", () => {
    const { container } = render(
      <PlanBadge plan={null} subscriptionStatus="loading" freeTokensRemaining={null} usageLoading={false} onUpgrade={vi.fn()} />,
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows plan name with Crown icon when subscription is active", () => {
    render(
      <PlanBadge plan="Premium" subscriptionStatus="active" freeTokensRemaining={null} usageLoading={false} onUpgrade={vi.fn()} />,
    );
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });

  it("shows Free with remaining tokens for free users", () => {
    render(
      <PlanBadge plan={null} subscriptionStatus="inactive" freeTokensRemaining={5} usageLoading={false} onUpgrade={vi.fn()} />,
    );
    expect(screen.getByText("Free · 5 left")).toBeInTheDocument();
  });

  it("shows Free without token count while usage is loading", () => {
    render(
      <PlanBadge plan={null} subscriptionStatus="inactive" freeTokensRemaining={5} usageLoading={true} onUpgrade={vi.fn()} />,
    );
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it("fires onUpgrade when free badge is clicked", () => {
    const onUpgrade = vi.fn();
    render(
      <PlanBadge plan={null} subscriptionStatus="inactive" freeTokensRemaining={3} usageLoading={false} onUpgrade={onUpgrade} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it("applies warning styling when tokens are low (<=2)", () => {
    render(
      <PlanBadge plan={null} subscriptionStatus="inactive" freeTokensRemaining={1} usageLoading={false} onUpgrade={vi.fn()} />,
    );
    expect(screen.getByRole("button").className).toContain("warning-gold");
  });
});
