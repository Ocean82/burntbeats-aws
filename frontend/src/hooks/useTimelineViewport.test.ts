import { describe, expect, it } from "vitest";
import {
  useTimelineViewport,
  toVisiblePercent,
  toAbsolutePercent,
} from "./useTimelineViewport";
import { renderHook, act } from "@testing-library/react";

describe("toVisiblePercent", () => {
  it("maps 0% to 0 when viewing full range", () => {
    expect(toVisiblePercent(0, 0, 1)).toBe(0);
  });

  it("maps 100% to 100 when viewing full range", () => {
    expect(toVisiblePercent(100, 0, 1)).toBe(100);
  });

  it("maps midpoint to 50% when viewing full range", () => {
    expect(toVisiblePercent(50, 0, 1)).toBe(50);
  });

  it("maps correctly when zoomed into second half", () => {
    // visibleStart=0.5, visibleRange=0.5
    expect(toVisiblePercent(50, 0.5, 0.5)).toBe(0);
    expect(toVisiblePercent(75, 0.5, 0.5)).toBe(50);
    expect(toVisiblePercent(100, 0.5, 0.5)).toBe(100);
  });

  it("clamps values outside visible range", () => {
    expect(toVisiblePercent(10, 0.5, 0.5)).toBe(0);
    expect(toVisiblePercent(90, 0, 0.5)).toBe(100);
  });
});

describe("toAbsolutePercent", () => {
  it("maps 0% visible to 0% absolute when viewing full range", () => {
    expect(toAbsolutePercent(0, 0, 1)).toBe(0);
  });

  it("maps 100% visible to 100% absolute when viewing full range", () => {
    expect(toAbsolutePercent(100, 0, 1)).toBe(100);
  });

  it("maps correctly when zoomed into second half", () => {
    expect(toAbsolutePercent(0, 0.5, 0.5)).toBe(50);
    expect(toAbsolutePercent(50, 0.5, 0.5)).toBe(75);
    expect(toAbsolutePercent(100, 0.5, 0.5)).toBe(100);
  });
});

describe("useTimelineViewport", () => {
  it("returns initial state at zoom 1", () => {
    const { result } = renderHook(() => useTimelineViewport(1, 8, 1));
    expect(result.current.zoom).toBe(1);
    expect(result.current.scrollPct).toBe(0);
    expect(result.current.maxScrollPct).toBe(0);
    expect(result.current.visibleStart).toBe(0);
    expect(result.current.visibleEnd).toBe(1);
  });

  it("increases zoom and computes maxScrollPct", () => {
    const { result } = renderHook(() => useTimelineViewport(1, 8, 1));
    act(() => result.current.setZoom(2));
    expect(result.current.zoom).toBe(2);
    expect(result.current.maxScrollPct).toBe(50);
    // At zoom=2, scrollPct=0: visibleEnd = min(1, 0 + 1/2) = 0.5
    expect(result.current.visibleEnd).toBe(0.5);
  });

  it("clamps zoom to min/max", () => {
    const { result } = renderHook(() => useTimelineViewport(1, 8, 1));
    act(() => result.current.setZoom(0));
    expect(result.current.zoom).toBe(1);
    act(() => result.current.setZoom(100));
    expect(result.current.zoom).toBe(8);
  });

  it("scrolls when zoomed in", () => {
    const { result } = renderHook(() => useTimelineViewport(1, 8, 1));
    act(() => result.current.setZoom(4));
    act(() => result.current.setScrollPct(50));
    expect(result.current.scrollPct).toBe(50);
    expect(result.current.visibleStart).toBe(0.5);
    expect(result.current.visibleEnd).toBe(0.75);
  });

  it("clamps scroll when zoom decreases", () => {
    const { result } = renderHook(() => useTimelineViewport(1, 8, 4));
    act(() => result.current.setScrollPct(75));
    act(() => result.current.setZoom(2));
    // maxScrollPct for zoom=2 is 50, so scroll should be clamped
    expect(result.current.scrollPct).toBeLessThanOrEqual(50);
  });

  it("supports functional zoom updates", () => {
    const { result } = renderHook(() => useTimelineViewport(1, 8, 2));
    act(() => result.current.setZoom((z) => z * 2));
    expect(result.current.zoom).toBe(4);
  });

  it("visibleRange is never zero", () => {
    const { result } = renderHook(() => useTimelineViewport(1, 8, 8));
    expect(result.current.visibleRange).toBeGreaterThan(0);
  });
});
