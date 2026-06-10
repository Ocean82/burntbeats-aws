import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransportBar, type TransportBarProps } from "./TransportBar";

describe("TransportBar", () => {
  const defaultProps: TransportBarProps = {
    isPlaying: false,
    onPlayPause: vi.fn(),
    onStop: vi.fn(),
    onRewind: vi.fn(),
    zoom: 1,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    loopEnabled: false,
    onLoopToggle: vi.fn(),
  };

  function setup(overrides: Partial<TransportBarProps> = {}) {
    const props = { ...defaultProps, ...overrides };
    return render(<TransportBar {...props} />);
  }

  it("renders with 48px height", () => {
    setup();
    const toolbar = screen.getByRole("toolbar", { name: "Transport controls" });
    expect(toolbar).toHaveStyle({ height: "48px" });
  });

  it("has sticky positioning class", () => {
    setup();
    const toolbar = screen.getByRole("toolbar", { name: "Transport controls" });
    expect(toolbar.className).toContain("sticky");
  });

  it("renders play button when not playing", () => {
    setup({ isPlaying: false });
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });

  it("renders pause button when playing", () => {
    setup({ isPlaying: true });
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
  });

  it("calls onPlayPause when play/pause button is clicked", () => {
    const onPlayPause = vi.fn();
    setup({ onPlayPause });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("calls onStop when stop button is clicked", () => {
    const onStop = vi.fn();
    setup({ onStop });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("calls onRewind when rewind button is clicked", () => {
    const onRewind = vi.fn();
    setup({ onRewind });
    fireEvent.click(screen.getByRole("button", { name: "Rewind" }));
    expect(onRewind).toHaveBeenCalledTimes(1);
  });

  it("renders zoom controls with current zoom percentage", () => {
    setup({ zoom: 2 });
    expect(screen.getByText("200%")).toBeInTheDocument();
  });

  it("calls onZoomIn and onZoomOut", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    setup({ zoom: 2, onZoomIn, onZoomOut });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });

  it("disables zoom out at minimum zoom", () => {
    setup({ zoom: 1 });
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });

  it("disables zoom in at maximum zoom", () => {
    setup({ zoom: 8 });
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  });

  it("renders loop toggle with aria-pressed state", () => {
    setup({ loopEnabled: true });
    const loopBtn = screen.getByRole("button", { name: "Disable loop" });
    expect(loopBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onLoopToggle when loop button is clicked", () => {
    const onLoopToggle = vi.fn();
    setup({ onLoopToggle });
    fireEvent.click(screen.getByRole("button", { name: "Enable loop" }));
    expect(onLoopToggle).toHaveBeenCalledTimes(1);
  });

  it("renders export button when onExport is provided", () => {
    const onExport = vi.fn();
    setup({ onExport });
    const exportBtn = screen.getByRole("button", { name: "Export" });
    expect(exportBtn).toBeInTheDocument();
    fireEvent.click(exportBtn);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("does not render export button when onExport is not provided", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
  });

  it("renders seek scrubber when onSeek is provided", () => {
    setup({ onSeek: vi.fn() });
    expect(screen.getByRole("slider", { name: "Seek position" })).toBeInTheDocument();
  });

  it("does not render seek scrubber when onSeek is not provided", () => {
    setup();
    expect(screen.queryByRole("slider", { name: "Seek position" })).not.toBeInTheDocument();
  });

  it("applies disabled styling when disabled prop is true", () => {
    setup({ disabled: true });
    const toolbar = screen.getByRole("toolbar", { name: "Transport controls" });
    expect(toolbar.className).toContain("pointer-events-none");
    expect(toolbar.className).toContain("opacity-50");
  });

  it("all interactive elements have accessible labels", () => {
    setup({ onSeek: vi.fn(), onExport: vi.fn() });
    // All buttons should have aria-label
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toHaveAccessibleName();
    });
    // Slider should have aria-label
    expect(screen.getByRole("slider")).toHaveAccessibleName();
  });
});
