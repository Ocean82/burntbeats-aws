import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useToolDrawer } from "./useToolDrawer";

describe("useToolDrawer", () => {
  it("initializes with no active tool and closed state", () => {
    const { result } = renderHook(() => useToolDrawer());
    expect(result.current.activeTool).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("open(tool) sets the active tool and opens the panel", () => {
    const { result } = renderHook(() => useToolDrawer());
    act(() => result.current.open("pitch"));
    expect(result.current.activeTool).toBe("pitch");
    expect(result.current.isOpen).toBe(true);
  });

  it("close() clears the active tool and closes the panel", () => {
    const { result } = renderHook(() => useToolDrawer());
    act(() => result.current.open("eq"));
    act(() => result.current.close());
    expect(result.current.activeTool).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("toggle(tool) opens the tool if nothing is active", () => {
    const { result } = renderHook(() => useToolDrawer());
    act(() => result.current.toggle("amplitude"));
    expect(result.current.activeTool).toBe("amplitude");
    expect(result.current.isOpen).toBe(true);
  });

  it("toggle(tool) closes if the same tool is already active", () => {
    const { result } = renderHook(() => useToolDrawer());
    act(() => result.current.open("fx"));
    act(() => result.current.toggle("fx"));
    expect(result.current.activeTool).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("toggle(tool) switches to different tool if another is active (panel stays open)", () => {
    const { result } = renderHook(() => useToolDrawer());
    act(() => result.current.open("pitch"));
    act(() => result.current.toggle("eq"));
    expect(result.current.activeTool).toBe("eq");
    expect(result.current.isOpen).toBe(true);
  });

  it("maintains at-most-one-active invariant across multiple operations", () => {
    const { result } = renderHook(() => useToolDrawer());
    act(() => result.current.open("pitch"));
    act(() => result.current.open("eq"));
    expect(result.current.activeTool).toBe("eq");

    act(() => result.current.toggle("timeStretch"));
    expect(result.current.activeTool).toBe("timeStretch");

    act(() => result.current.toggle("timeStretch"));
    expect(result.current.activeTool).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });
});
