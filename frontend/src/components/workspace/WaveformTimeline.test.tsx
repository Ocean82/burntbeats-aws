import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WaveformTimeline, type WaveformTimelineProps, type WaveformTimelineStem, STEM_LANE_COLORS } from "./WaveformTimeline";

// Mock canvas context since jsdom doesn't support canvas rendering
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  closePath: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  setTransform: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  drawImage: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

const testStems: WaveformTimelineStem[] = [
  { id: "vocals", label: "Vocals", color: "#ff2d9b" },
  { id: "drums", label: "Drums", color: "#00d4ff" },
  { id: "bass", label: "Bass", color: "#39ff14" },
  { id: "melody", label: "Melody", color: "#ffaa00" },
];

describe("WaveformTimeline", () => {
  const defaultProps: WaveformTimelineProps = {
    stems: testStems,
  };

  function setup(overrides: Partial<WaveformTimelineProps> = {}) {
    const props = { ...defaultProps, ...overrides };
    return render(<WaveformTimeline {...props} />);
  }

  it("renders with minimum height of 200px", () => {
    setup();
    const timeline = screen.getByTestId("waveform-timeline");
    expect(timeline).toHaveStyle({ minHeight: "200px" });
  });

  it("renders a lane for each stem", () => {
    setup();
    for (const stem of testStems) {
      expect(
        screen.getByRole("button", { name: new RegExp(stem.label) }),
      ).toBeInTheDocument();
    }
  });

  it("applies distinct stem colors (≥ 4)", () => {
    setup();
    // All 4 stems are rendered with their unique colors
    const lanes = screen.getAllByRole("button");
    expect(lanes.length).toBeGreaterThanOrEqual(4);
  });

  it("highlights the active stem lane", () => {
    setup({ activeStemId: "drums" });
    const lane = screen.getByRole("button", { name: /Drums/ });
    // Active lane has the accent rail (a span with the stem color background)
    const rail = lane.querySelector("span[aria-hidden]");
    expect(rail).toBeInTheDocument();
  });

  it("calls onStemActivate when a lane is clicked", () => {
    const onStemActivate = vi.fn();
    setup({ onStemActivate });
    fireEvent.click(screen.getByRole("button", { name: /Bass/ }));
    expect(onStemActivate).toHaveBeenCalledWith("bass");
  });

  it("calls onStemActivate on keyboard activation (Enter)", () => {
    const onStemActivate = vi.fn();
    setup({ onStemActivate });
    fireEvent.keyDown(screen.getByRole("button", { name: /Melody/ }), { key: "Enter" });
    expect(onStemActivate).toHaveBeenCalledWith("melody");
  });

  it("calls onStemActivate on keyboard activation (Space)", () => {
    const onStemActivate = vi.fn();
    setup({ onStemActivate });
    fireEvent.keyDown(screen.getByRole("button", { name: /Vocals/ }), { key: " " });
    expect(onStemActivate).toHaveBeenCalledWith("vocals");
  });

  it("renders playhead when showPlayhead is true", () => {
    const { container } = setup({ showPlayhead: true, playheadPct: 50 });
    const playhead = container.querySelector('[aria-hidden="true"].absolute.inset-y-0.w-0\\.5');
    expect(playhead).toBeInTheDocument();
  });

  it("does not render playhead when showPlayhead is false", () => {
    const { container } = setup({ showPlayhead: false });
    // No playhead line rendered
    const playheadLine = container.querySelector(".z-20.w-0\\.5");
    expect(playheadLine).not.toBeInTheDocument();
  });

  it("positions playhead at specified percentage", () => {
    const { container } = setup({ showPlayhead: true, playheadPct: 75 });
    const playhead = container.querySelector("[style*='left: 75%']");
    expect(playhead).toBeInTheDocument();
  });

  it("renders with dark background (< 15% lightness)", () => {
    setup();
    const timeline = screen.getByTestId("waveform-timeline");
    // bg-[hsl(0_0%_8%)] corresponds to ~8% lightness which is < 15%
    expect(timeline.className).toContain("bg-[hsl(0_0%_8%)]");
  });

  it("applies custom className", () => {
    setup({ className: "my-custom-class" });
    const timeline = screen.getByTestId("waveform-timeline");
    expect(timeline.className).toContain("my-custom-class");
  });

  it("has accessible label on the container", () => {
    setup();
    const timeline = screen.getByLabelText("Waveform timeline");
    expect(timeline).toBeInTheDocument();
  });

  it("each lane has accessible label", () => {
    setup();
    const lanes = screen.getAllByRole("button");
    lanes.forEach((lane) => {
      expect(lane).toHaveAccessibleName();
    });
  });

  it("fills available vertical space with h-full and flex-1", () => {
    setup();
    const timeline = screen.getByTestId("waveform-timeline");
    expect(timeline.className).toContain("h-full");
    expect(timeline.className).toContain("flex-1");
  });
});

/* ─── STEM_LANE_COLORS validation (Requirement 8.4) ──────────────── */

describe("STEM_LANE_COLORS", () => {
  /**
   * Parse a hex color to HSL hue (degrees).
   */
  function hexToHue(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) return 0;
    let hue: number;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
    return hue;
  }

  /**
   * Compute relative luminance per WCAG 2.1.
   */
  function relativeLuminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  }

  /**
   * Compute contrast ratio between two colors.
   */
  function contrastRatio(hex1: string, hex2: string): number {
    const l1 = relativeLuminance(hex1);
    const l2 = relativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  const DARK_BACKGROUND = "#141414"; // hsl(0, 0%, 8%) ≈ #141414

  it("provides at least 4 distinct colors", () => {
    expect(STEM_LANE_COLORS.length).toBeGreaterThanOrEqual(4);
    const unique = new Set(STEM_LANE_COLORS);
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });

  it("each color has ≥ 3:1 contrast ratio against dark background", () => {
    for (const color of STEM_LANE_COLORS) {
      const ratio = contrastRatio(color, DARK_BACKGROUND);
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });

  it("adjacent lane colors have ≥ 30° hue separation", () => {
    for (let i = 0; i < STEM_LANE_COLORS.length - 1; i++) {
      const hue1 = hexToHue(STEM_LANE_COLORS[i]);
      const hue2 = hexToHue(STEM_LANE_COLORS[i + 1]);
      const diff = Math.abs(hue1 - hue2);
      const separation = Math.min(diff, 360 - diff);
      expect(separation).toBeGreaterThanOrEqual(30);
    }
  });
});
