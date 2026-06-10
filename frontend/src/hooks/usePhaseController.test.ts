import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePhaseController } from "./usePhaseController";

const SPLIT_RESULT_KEY = "burnt-beats-split-result";

describe("usePhaseController", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("initializes to 'upload' when no prior result exists", () => {
    const { result } = renderHook(() => usePhaseController());
    expect(result.current.phase).toBe("upload");
  });

  it("initializes to 'workspace' when prior result exists in sessionStorage", () => {
    sessionStorage.setItem(SPLIT_RESULT_KEY, JSON.stringify({ stemIds: ["a"] }));
    const { result } = renderHook(() => usePhaseController());
    expect(result.current.phase).toBe("workspace");
  });

  it("transitionTo updates the phase", () => {
    const { result } = renderHook(() => usePhaseController());
    act(() => result.current.transitionTo("configure"));
    expect(result.current.phase).toBe("configure");
  });

  it("transitionTo clears any existing error", () => {
    const { result } = renderHook(() => usePhaseController());
    act(() => result.current.setError("some error"));
    expect(result.current.error).toBe("some error");

    act(() => result.current.transitionTo("configure"));
    expect(result.current.error).toBeNull();
  });

  it("reset() clears sessionStorage and transitions to 'upload'", () => {
    sessionStorage.setItem(SPLIT_RESULT_KEY, JSON.stringify({ stemIds: ["a"] }));
    const { result } = renderHook(() => usePhaseController());
    expect(result.current.phase).toBe("workspace");

    act(() => result.current.reset());
    expect(result.current.phase).toBe("upload");
    expect(sessionStorage.getItem(SPLIT_RESULT_KEY)).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("reset() remains in 'workspace' and sets error if clearing fails", () => {
    sessionStorage.setItem(SPLIT_RESULT_KEY, JSON.stringify({ stemIds: ["a"] }));
    const { result } = renderHook(() => usePhaseController());

    // Mock sessionStorage.removeItem to throw
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage quota exceeded");
    });

    act(() => result.current.reset());
    expect(result.current.phase).toBe("workspace");
    expect(result.current.error).toBe("Storage quota exceeded");

    removeItemSpy.mockRestore();
  });

  it("setError sets and clears error messages", () => {
    const { result } = renderHook(() => usePhaseController());
    act(() => result.current.setError("File too large"));
    expect(result.current.error).toBe("File too large");

    act(() => result.current.setError(null));
    expect(result.current.error).toBeNull();
  });

  it("falls back to 'upload' when sessionStorage is unavailable on init", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    const { result } = renderHook(() => usePhaseController());
    expect(result.current.phase).toBe("upload");

    getItemSpy.mockRestore();
  });
});
