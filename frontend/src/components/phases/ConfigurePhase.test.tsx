import { render } from "@testing-library/react"
import { fireEvent, screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { ConfigurePhase } from "./ConfigurePhase";

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: false, isLoaded: true, getToken: () => Promise.resolve(null) }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}));

describe("ConfigurePhase", () => {
  const defaultProps = {
    transitionTo: vi.fn(),
    fileName: "my-track.wav",
    onConfigure: vi.fn(),
  };

  function setup(overrides = {}) {
    const props = { ...defaultProps, ...overrides };
    return render(<ConfigurePhase {...props} />);
  }

  it("renders the configure phase container", () => {
    setup();
    expect(screen.getByTestId("configure-phase")).toBeInTheDocument();
  });

  it("displays the uploaded filename", () => {
    setup({ fileName: "song.mp3" });
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
  });

  it("renders quality selector with Fast and Quality options", () => {
    setup();
    expect(screen.getByText("Fast")).toBeInTheDocument();
    // "Quality" appears both as the legend and as a button label
    const qualityElements = screen.getAllByText("Quality");
    expect(qualityElements.length).toBeGreaterThanOrEqual(2);
    // The button option should exist with aria-pressed
    const qualityButton = screen.getByRole("button", { name: /Quality/i, pressed: true });
    expect(qualityButton).toBeInTheDocument();
  });

  it("renders stem count selector with 2 and 4 stem options", () => {
    setup();
    expect(screen.getByText("2 stems")).toBeInTheDocument();
    expect(screen.getByText("4 stems")).toBeInTheDocument();
  });

  it("renders the Split action button", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Split" }),
    ).toBeInTheDocument();
  });

  it("calls onConfigure and transitionTo('splitting') on Split click", () => {
    const transitionTo = vi.fn();
    const onConfigure = vi.fn();
    setup({ transitionTo, onConfigure });

    fireEvent.click(screen.getByRole("button", { name: "Split" }));

    expect(onConfigure).toHaveBeenCalledWith({ quality: "quality", stemCount: 2 });
    expect(transitionTo).toHaveBeenCalledWith("splitting");
  });

  it("uses selected quality and stem count when splitting", () => {
    const transitionTo = vi.fn();
    const onConfigure = vi.fn();
    setup({ transitionTo, onConfigure });

    // Select "Fast" quality
    fireEvent.click(screen.getByText("Fast"));
    // Select 4 stems
    fireEvent.click(screen.getByText("4 stems"));
    // Click split
    fireEvent.click(screen.getByRole("button", { name: "Split" }));

    expect(onConfigure).toHaveBeenCalledWith({ quality: "speed", stemCount: 4 });
    expect(transitionTo).toHaveBeenCalledWith("splitting");
  });

  it("does not render upload zone or workspace elements", () => {
    const { container } = setup();
    expect(container.querySelector("[data-testid='upload-phase']")).toBeNull();
    expect(container.querySelector("[data-testid='workspace']")).toBeNull();
  });

  it("has rounded-2xl panel styling", () => {
    setup();
    const panel = screen.getByTestId("configure-phase").querySelector(".rounded-2xl");
    expect(panel).toBeInTheDocument();
  });
});
