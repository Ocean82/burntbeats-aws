import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WaveformLane } from "./waveform-lane.component";
import { defaultMixer, type StemId } from "../../types";

const drawWaveformBars = vi.fn();
vi.mock("../../utils/waveformCanvas", () => ({
  drawWaveformBars: (...args: unknown[]) => drawWaveformBars(...args),
}));

function mockCanvasContext() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
  };
}

describe("WaveformLane rendering strategy", () => {
  beforeEach(() => {
    drawWaveformBars.mockClear();
    vi.stubGlobal(
      "requestAnimationFrame",
      (() => 1) as unknown as typeof requestAnimationFrame,
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function getContext(this: HTMLCanvasElement) {
        const ctx = mockCanvasContext();
        Object.defineProperty(this, "clientWidth", { value: 320, configurable: true });
        Object.defineProperty(this, "clientHeight", { value: 80, configurable: true });
        this.width = 320;
        this.height = 80;
        return ctx as unknown as CanvasRenderingContext2D;
      },
    );
  });

  it("does not redraw static waveform when only playhead changes", () => {
    const baseProps = {
      stem: {
        id: "vocals" as StemId,
        label: "Vocals",
        subtitle: "Lead",
        flavor: "Bright",
        glow: "#fff",
        glowSoft: "#bbb",
        waveform: [0.1, 0.2],
      },
      waveform: [0.1, 0.2, 0.3, 0.4],
      trim: { start: 0, end: 100 },
      mixer: defaultMixer,
      isActive: true,
      isMuted: false,
      isSoloed: false,
      zoom: 1,
      scrollPct: 0,
      onTrimChange: vi.fn(),
      onSeek: vi.fn(),
      onActivate: vi.fn(),
      onStemStateChange: vi.fn(),
    };

    const { rerender } = render(
      <WaveformLane {...baseProps} playheadFraction={0.2} />,
    );
    const firstCount = drawWaveformBars.mock.calls.length;
    rerender(<WaveformLane {...baseProps} playheadFraction={0.8} />);

    expect(drawWaveformBars.mock.calls.length).toBe(firstCount);
  });
});
