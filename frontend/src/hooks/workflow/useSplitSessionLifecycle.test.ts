import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSplitSessionLifecycle } from "./useSplitSessionLifecycle";

describe("useSplitSessionLifecycle", () => {
  it("calls focus handler when split completes with stems", () => {
    vi.useFakeTimers();
    const onFocusMixer = vi.fn();

    const { rerender } = renderHook(
      (props: { isSplitting: boolean; splitResultStemsLength: number }) =>
        useSplitSessionLifecycle({
          ...props,
          splitJobId: "job-1",
          onResetStemMediaState: vi.fn(),
          onFocusMixer,
        }),
      { initialProps: { isSplitting: true, splitResultStemsLength: 0 } },
    );

    rerender({ isSplitting: false, splitResultStemsLength: 2 });
    vi.advanceTimersByTime(321);

    expect(onFocusMixer).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
