import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TokenMeter } from "./TokenMeter";

describe("TokenMeter", () => {
  it("renders nothing for paid users", () => {
    const { container } = render(
      <TokenMeter freeTokensRemaining={5} isPaidUser={true} usageLoading={false} onUpgrade={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while usage is loading", () => {
    const { container } = render(
      <TokenMeter freeTokensRemaining={5} isPaidUser={false} usageLoading={true} onUpgrade={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when freeTokensRemaining is null", () => {
    const { container } = render(
      <TokenMeter freeTokensRemaining={null} isPaidUser={false} usageLoading={false} onUpgrade={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("displays remaining token count", () => {
    render(
      <TokenMeter freeTokensRemaining={5} isPaidUser={false} usageLoading={false} onUpgrade={vi.fn()} />,
    );
    expect(screen.getByText(/5 tokens?/)).toBeInTheDocument();
  });

  it("displays singular 'token' for count of 1", () => {
    render(
      <TokenMeter freeTokensRemaining={1} isPaidUser={false} usageLoading={false} onUpgrade={vi.fn()} />,
    );
    expect(screen.getByText(/1 token/)).toBeInTheDocument();
  });

  it("shows warning when estimated tokens exceed remaining", () => {
    render(
      <TokenMeter freeTokensRemaining={2} isPaidUser={false} usageLoading={false} onUpgrade={vi.fn()} estimatedTokens={3} />,
    );
    expect(screen.getByText(/may use your last tokens/)).toBeInTheDocument();
  });

  it("fires onUpgrade when Upgrade link is clicked", () => {
    const onUpgrade = vi.fn();
    render(
      <TokenMeter freeTokensRemaining={5} isPaidUser={false} usageLoading={false} onUpgrade={onUpgrade} />,
    );
    fireEvent.click(screen.getByText("Upgrade"));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });
});
