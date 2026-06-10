import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useWorkspaceLayout } from "./useWorkspaceLayout";

describe("useWorkspaceLayout", () => {
  it("initializes with mixer expanded", () => {
    const { result } = renderHook(() => useWorkspaceLayout());
    expect(result.current.mixerExpanded).toBe(true);
  });

  it("toggleMixer toggles the mixer state", () => {
    const { result } = renderHook(() => useWorkspaceLayout());
    act(() => result.current.toggleMixer());
    expect(result.current.mixerExpanded).toBe(false);

    act(() => result.current.toggleMixer());
    expect(result.current.mixerExpanded).toBe(true);
  });

  it("viewportSize reflects window dimensions", () => {
    const { result } = renderHook(() => useWorkspaceLayout());
    expect(result.current.viewportSize.width).toBe(window.innerWidth);
    expect(result.current.viewportSize.height).toBe(window.innerHeight);
  });

  it("viewportSize updates on window resize", () => {
    const { result } = renderHook(() => useWorkspaceLayout());

    act(() => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1920 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 1080 });
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.viewportSize.width).toBe(1920);
    expect(result.current.viewportSize.height).toBe(1080);
  });
});
