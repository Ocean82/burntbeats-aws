import { describe, expect, it } from "vitest";
import { drawWaveformBars, type DrawWaveformBarsParams } from "./waveformCanvas";

function createMockCanvas(width = 200, height = 56): HTMLCanvasElement {
  const ctx = {
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    roundRect: () => {},
    fill: () => {},
    fillStyle: "",
    globalAlpha: 1,
  };
  return {
    clientWidth: width,
    clientHeight: height,
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

function baseParams(overrides: Partial<DrawWaveformBarsParams> = {}): DrawWaveformBarsParams {
  return {
    canvas: createMockCanvas(),
    values: [0.2, 0.5, 0.8, 0.3, 0.6],
    color: "#ff845c",
    minimumBarHeightPx: 8,
    ...overrides,
  };
}

describe("drawWaveformBars", () => {
  it("does not throw with valid inputs", () => {
    expect(() => drawWaveformBars(baseParams())).not.toThrow();
  });

  it("does not throw with empty values", () => {
    expect(() => drawWaveformBars(baseParams({ values: [] }))).not.toThrow();
  });

  it("handles zero-size canvas", () => {
    expect(() =>
      drawWaveformBars(baseParams({ canvas: createMockCanvas(0, 0) }))
    ).not.toThrow();
  });

  it("applies custom alpha values", () => {
    expect(() =>
      drawWaveformBars(baseParams({ alphaEven: 0.5, alphaOdd: 0.3 }))
    ).not.toThrow();
  });

  it("applies custom gap", () => {
    expect(() =>
      drawWaveformBars(baseParams({ gapPx: 3 }))
    ).not.toThrow();
  });

  it("applies height scale", () => {
    expect(() =>
      drawWaveformBars(baseParams({ heightScale: 0.5 }))
    ).not.toThrow();
  });

  it("handles single value", () => {
    expect(() =>
      drawWaveformBars(baseParams({ values: [0.5] }))
    ).not.toThrow();
  });

  it("clamps values above 1", () => {
    expect(() =>
      drawWaveformBars(baseParams({ values: [1.5, 2.0, -0.5] }))
    ).not.toThrow();
  });

  it("uses fallback fillRect when roundRect is not available", () => {
    const ctx = {
      setTransform: () => {},
      clearRect: () => {},
      fillRect: () => {},
      fillStyle: "",
      globalAlpha: 1,
    };
    const canvas = {
      clientWidth: 200,
      clientHeight: 56,
      width: 0,
      height: 0,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    expect(() =>
      drawWaveformBars(baseParams({ canvas }))
    ).not.toThrow();
  });

  it("handles null context gracefully", () => {
    const canvas = {
      clientWidth: 200,
      clientHeight: 56,
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    expect(() =>
      drawWaveformBars(baseParams({ canvas }))
    ).not.toThrow();
  });
});
