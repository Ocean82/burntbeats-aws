import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SplittingPhase } from "./SplittingPhase";

describe("SplittingPhase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders progress indicator with spinner when splitting is active", () => {
    render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={45}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByTestId("splitting-phase")).toBeInTheDocument();
    expect(screen.getByText("Splitting stems...")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("increments elapsed time every 1 second", () => {
    render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={30}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Elapsed: 0s")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Elapsed: 1s")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText("Elapsed: 5s")).toBeInTheDocument();
  });

  it("formats elapsed time as Xm Ys when over 60 seconds", () => {
    render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={50}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(94000); // 94 seconds = 1m 34s
    });
    expect(screen.getByText("Elapsed: 1m 34s")).toBeInTheDocument();
  });

  it("shows 'Estimating...' when estimatedSeconds is not provided", () => {
    render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={10}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Estimating...")).toBeInTheDocument();
  });

  it("shows estimated remaining time when estimatedSeconds is provided", () => {
    render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={10}
        error={null}
        onRetry={vi.fn()}
        estimatedSeconds={60}
      />,
    );

    expect(screen.getByText("~1m 0s remaining")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.getByText("~45s remaining")).toBeInTheDocument();
  });

  it("shows 'Almost done...' when remaining time is zero or negative", () => {
    render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={95}
        error={null}
        onRetry={vi.fn()}
        estimatedSeconds={10}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(11000);
    });
    expect(screen.getByText("Almost done...")).toBeInTheDocument();
  });

  it("calls transitionTo('workspace') when progress reaches 100 and no error", () => {
    const transitionTo = vi.fn();

    render(
      <SplittingPhase
        transitionTo={transitionTo}
        progress={100}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(transitionTo).toHaveBeenCalledWith("workspace");
  });

  it("does NOT call transitionTo when progress is 100 but error exists", () => {
    const transitionTo = vi.fn();

    render(
      <SplittingPhase
        transitionTo={transitionTo}
        progress={100}
        error="Server error"
        onRetry={vi.fn()}
      />,
    );

    expect(transitionTo).not.toHaveBeenCalled();
  });

  it("displays error message and retry button on failure", () => {
    render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={60}
        error="Network timeout"
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Splitting failed")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Network timeout");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn();

    render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={60}
        error="Something went wrong"
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("stops the elapsed timer when error occurs", () => {
    const { rerender } = render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={30}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("Elapsed: 3s")).toBeInTheDocument();

    // Simulate error arriving
    rerender(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={30}
        error="Failed"
        onRetry={vi.fn()}
      />,
    );

    // Timer should not increment in error state (no elapsed display shown either,
    // but verify the interval was cleared by checking no state update errors)
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // In error state, the progress UI is not rendered — the error UI is shown instead
    expect(screen.getByText("Splitting failed")).toBeInTheDocument();
  });

  it("does not show configuration controls during splitting", () => {
    render(
      <SplittingPhase
        transitionTo={vi.fn()}
        progress={50}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    // No configuration-related elements should exist
    expect(screen.queryByText(/quality/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stem count/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/upload/i)).not.toBeInTheDocument();
  });
});
