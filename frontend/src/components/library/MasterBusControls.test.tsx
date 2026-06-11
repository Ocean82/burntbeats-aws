import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MasterBusControls } from "./MasterBusControls";

describe("MasterBusControls", () => {
  const defaultProps = {
    gridVolume: 0.8,
    overlayVolume: 0.6,
    onGridVolumeChange: vi.fn(),
    onOverlayVolumeChange: vi.fn(),
  };

  it("renders grid and overlay volume sliders", () => {
    render(<MasterBusControls {...defaultProps} />);

    expect(screen.getByLabelText("Grid volume")).toBeInTheDocument();
    expect(screen.getByLabelText("Overlay volume")).toBeInTheDocument();
  });

  it("displays current grid volume as percentage", () => {
    render(<MasterBusControls {...defaultProps} gridVolume={0.8} />);

    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("displays current overlay volume as percentage", () => {
    render(<MasterBusControls {...defaultProps} overlayVolume={0.6} />);

    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("grid slider has range 0 to 1 with step 0.01", () => {
    render(<MasterBusControls {...defaultProps} />);

    const slider = screen.getByLabelText("Grid volume");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "1");
    expect(slider).toHaveAttribute("step", "0.01");
  });

  it("overlay slider has range 0 to 1 with step 0.01", () => {
    render(<MasterBusControls {...defaultProps} />);

    const slider = screen.getByLabelText("Overlay volume");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "1");
    expect(slider).toHaveAttribute("step", "0.01");
  });

  it("calls onGridVolumeChange when grid slider changes", () => {
    const onGridVolumeChange = vi.fn();
    render(
      <MasterBusControls {...defaultProps} onGridVolumeChange={onGridVolumeChange} />,
    );

    const slider = screen.getByLabelText("Grid volume");
    fireEvent.change(slider, { target: { value: "0.5" } });

    expect(onGridVolumeChange).toHaveBeenCalledWith(0.5);
  });

  it("calls onOverlayVolumeChange when overlay slider changes", () => {
    const onOverlayVolumeChange = vi.fn();
    render(
      <MasterBusControls {...defaultProps} onOverlayVolumeChange={onOverlayVolumeChange} />,
    );

    const slider = screen.getByLabelText("Overlay volume");
    fireEvent.change(slider, { target: { value: "0.3" } });

    expect(onOverlayVolumeChange).toHaveBeenCalledWith(0.3);
  });

  it("has accessible group role with label", () => {
    render(<MasterBusControls {...defaultProps} />);

    const group = screen.getByRole("group", { name: "Master bus volume controls" });
    expect(group).toBeInTheDocument();
  });

  it("shows default grid volume of 0.8 as 80%", () => {
    render(<MasterBusControls {...defaultProps} gridVolume={0.8} overlayVolume={0.6} />);

    const gridSlider = screen.getByLabelText("Grid volume") as HTMLInputElement;
    expect(gridSlider.value).toBe("0.8");
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("shows default overlay volume of 0.6 as 60%", () => {
    render(<MasterBusControls {...defaultProps} gridVolume={0.8} overlayVolume={0.6} />);

    const overlaySlider = screen.getByLabelText("Overlay volume") as HTMLInputElement;
    expect(overlaySlider.value).toBe("0.6");
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("displays 0% when volume is 0", () => {
    render(<MasterBusControls {...defaultProps} gridVolume={0} overlayVolume={0} />);

    const zeroPcts = screen.getAllByText("0%");
    expect(zeroPcts).toHaveLength(2);
  });

  it("displays 100% when volume is 1", () => {
    render(<MasterBusControls {...defaultProps} gridVolume={1} overlayVolume={1} />);

    const fullPcts = screen.getAllByText("100%");
    expect(fullPcts).toHaveLength(2);
  });

  it("labels identify grid vs overlay controls", () => {
    render(<MasterBusControls {...defaultProps} />);

    expect(screen.getByText("Grid")).toBeInTheDocument();
    expect(screen.getByText("Overlay")).toBeInTheDocument();
  });
});
