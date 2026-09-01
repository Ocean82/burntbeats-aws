import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFirstRunMode } from "./useFirstRunMode";

const mockClerkState = vi.hoisted(() => ({
  isLoaded: true,
  user: {
    id: "user_a",
    unsafeMetadata: {},
  },
}));

vi.mock("@clerk/react", () => ({
  useUser: () => mockClerkState,
}));

describe("useFirstRunMode", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockClerkState.isLoaded = true;
    mockClerkState.user = {
      id: "user_a",
      unsafeMetadata: {},
    };
  });

  it("keeps first-run completion scoped to the current user", () => {
    const firstUser = renderHook(() => useFirstRunMode());

    expect(firstUser.result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new CustomEvent("burntbeats-first-split-complete"));
    });

    expect(firstUser.result.current).toBe(false);
    firstUser.unmount();

    mockClerkState.user = {
      id: "user_b",
      unsafeMetadata: {},
    };

    const secondUser = renderHook(() => useFirstRunMode());

    expect(secondUser.result.current).toBe(true);
  });
});
