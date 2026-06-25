import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PostSplitUpsell } from "./PostSplitUpsell";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

describe("PostSplitUpsell", () => {
  it("renders nothing for paid users", () => {
    const { container } = render(
      <PostSplitUpsell isPaidUser={true} hasStems={true} onStartPremium={vi.fn()} onViewPlans={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when no stems are present", () => {
    const { container } = render(
      <PostSplitUpsell isPaidUser={false} hasStems={false} onStartPremium={vi.fn()} onViewPlans={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("appears after 800ms delay when eligible", () => {
    render(
      <PostSplitUpsell isPaidUser={false} hasStems={true} onStartPremium={vi.fn()} onViewPlans={vi.fn()} />,
    );
    expect(screen.queryByText(/Great split/)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(800); });
    expect(screen.getByText(/Great split/)).toBeInTheDocument();
  });

  it("fires onStartPremium when the premium button is clicked", () => {
    const onStartPremium = vi.fn();
    render(
      <PostSplitUpsell isPaidUser={false} hasStems={true} onStartPremium={onStartPremium} onViewPlans={vi.fn()} />,
    );
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.click(screen.getByRole("button", { name: /Start Premium/ }));
    expect(onStartPremium).toHaveBeenCalledOnce();
  });

  it("fires onViewPlans when the view plans button is clicked", () => {
    const onViewPlans = vi.fn();
    render(
      <PostSplitUpsell isPaidUser={false} hasStems={true} onStartPremium={vi.fn()} onViewPlans={onViewPlans} />,
    );
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.click(screen.getByRole("button", { name: /See all plans/ }));
    expect(onViewPlans).toHaveBeenCalledOnce();
  });

  it("persists dismissal to localStorage", () => {
    render(
      <PostSplitUpsell isPaidUser={false} hasStems={true} onStartPremium={vi.fn()} onViewPlans={vi.fn()} />,
    );
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(localStorage.getItem("burnt-beats-post-split-upsell-dismissed")).toBe("true");
  });

  it("does not reappear after dismissal", () => {
    const { rerender } = render(
      <PostSplitUpsell isPaidUser={false} hasStems={true} onStartPremium={vi.fn()} onViewPlans={vi.fn()} />,
    );
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    rerender(
      <PostSplitUpsell isPaidUser={false} hasStems={true} onStartPremium={vi.fn()} onViewPlans={vi.fn()} />,
    );
    expect(screen.queryByText(/Great split/)).not.toBeInTheDocument();
  });
});
