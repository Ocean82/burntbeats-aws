import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanBadge } from "./PlanBadge";

describe("PlanBadge", () => {
  it("renders a pulse skeleton while loading", () => {
    const { container } = render(
      <PlanBadge plan={null} subscriptionStatus="loading" freeTokensRemaining={null} usageLoading={false} />,
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows plan name with Crown icon when subscription is active", () => {
    render(
      <PlanBadge plan="Premium" subscriptionStatus="active" freeTokensRemaining={null} usageLoading={false} />,
    );
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });

  it("shows Free with remaining tokens for free users", () => {
    render(
      <PlanBadge plan={null} subscriptionStatus="inactive" freeTokensRemaining={5} usageLoading={false} />,
    );
    expect(screen.getByText("Free · 5 left")).toBeInTheDocument();
  });

  it("shows Free without token count while usage is loading", () => {
    render(
      <PlanBadge plan={null} subscriptionStatus="inactive" freeTokensRemaining={5} usageLoading={true} />,
    );
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it("applies warning styling when tokens are low (<=2)", () => {
    const { container } = render(
      <PlanBadge plan={null} subscriptionStatus="inactive" freeTokensRemaining={1} usageLoading={false} />,
    );
    expect(container.querySelector(".border-warning-gold\\/40")).toBeInTheDocument();
  });
});
