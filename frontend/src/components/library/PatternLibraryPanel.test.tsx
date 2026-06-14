import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PatternLibraryPanel } from "./PatternLibraryPanel";
import type { GenrePresetPattern } from "../../audio/genrePresets";

// Mock the genrePresets module so we can control what patterns are returned
vi.mock("../../audio/genrePresets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../audio/genrePresets")>();
  return {
    ...actual,
    // Re-export real functions — tests that need empty results will mock per-test
    getValidPresets: actual.getValidPresets,
    getPresetsByGenre: actual.getPresetsByGenre,
  };
});

const defaultProps = {
  onPatternSelect: vi.fn(),
  activePatternId: null,
  onVariationApply: vi.fn(),
  activeVariation: null as import("../../audio/genrePresets").VariationType | null,
  disabled: false,
};

describe("PatternLibraryPanel", () => {
  it("renders with aria-label identifying the panel purpose", () => {
    render(<PatternLibraryPanel {...defaultProps} />);
    expect(screen.getByLabelText("Pattern Library Panel")).toBeInTheDocument();
  });

  it("displays pattern entries with name, genre, tempo, and tags", () => {
    render(<PatternLibraryPanel {...defaultProps} />);

    const listbox = screen.getByRole("listbox", { name: "Available rhythm patterns" });

    // At minimum we should see the first preset "Basic Rock"
    expect(within(listbox).getByText("Basic Rock")).toBeInTheDocument();
    expect(within(listbox).getByText("120 BPM")).toBeInTheDocument();
    // Genre label (within the listbox to avoid matching the filter button)
    expect(within(listbox).getAllByText("Rock").length).toBeGreaterThan(0);
    // Tags
    expect(within(listbox).getByText("basic")).toBeInTheDocument();
    expect(within(listbox).getByText("steady")).toBeInTheDocument();
  });

  it("limits displayed entries to max 50", () => {
    render(<PatternLibraryPanel {...defaultProps} />);

    const listbox = screen.getByRole("listbox", { name: "Available rhythm patterns" });
    const options = within(listbox).getAllByRole("option");
    expect(options.length).toBeLessThanOrEqual(50);
  });

  it("applies visually distinct styling to the selected entry", () => {
    render(
      <PatternLibraryPanel {...defaultProps} activePatternId="rock-basic-4x4" />,
    );

    const listbox = screen.getByRole("listbox", { name: "Available rhythm patterns" });
    const selectedOption = within(listbox).getByRole("option", { selected: true });
    expect(selectedOption).toBeInTheDocument();
    expect(selectedOption).toHaveClass("ring-primary-400/45");
    expect(selectedOption).toHaveClass("bg-primary-500/10");
  });

  it("only one entry is selected at a time", () => {
    render(
      <PatternLibraryPanel {...defaultProps} activePatternId="rock-basic-4x4" />,
    );

    const listbox = screen.getByRole("listbox", { name: "Available rhythm patterns" });
    const selectedOptions = within(listbox).getAllByRole("option", { selected: true });
    expect(selectedOptions).toHaveLength(1);
  });

  it("calls onPatternSelect when an entry is clicked", () => {
    const onPatternSelect = vi.fn();
    render(
      <PatternLibraryPanel {...defaultProps} onPatternSelect={onPatternSelect} />,
    );

    fireEvent.click(screen.getByText("Basic Rock"));
    expect(onPatternSelect).toHaveBeenCalledTimes(1);
    const calledWith = onPatternSelect.mock.calls[0][0] as GenrePresetPattern;
    expect(calledWith.id).toBe("rock-basic-4x4");
  });

  it("deselects pattern when clicking the already selected entry", () => {
    const onPatternSelect = vi.fn();
    render(
      <PatternLibraryPanel
        {...defaultProps}
        onPatternSelect={onPatternSelect}
        activePatternId="rock-basic-4x4"
      />,
    );

    fireEvent.click(screen.getByText("Basic Rock"));
    expect(onPatternSelect).toHaveBeenCalledWith(null);
  });

  it("supports Enter key for selection", () => {
    const onPatternSelect = vi.fn();
    render(
      <PatternLibraryPanel {...defaultProps} onPatternSelect={onPatternSelect} />,
    );

    const listbox = screen.getByRole("listbox", { name: "Available rhythm patterns" });
    const firstOption = within(listbox).getAllByRole("option")[0];
    fireEvent.keyDown(firstOption, { key: "Enter" });
    expect(onPatternSelect).toHaveBeenCalledTimes(1);
  });

  it("supports Space key for selection", () => {
    const onPatternSelect = vi.fn();
    render(
      <PatternLibraryPanel {...defaultProps} onPatternSelect={onPatternSelect} />,
    );

    const listbox = screen.getByRole("listbox", { name: "Available rhythm patterns" });
    const firstOption = within(listbox).getAllByRole("option")[0];
    fireEvent.keyDown(firstOption, { key: " " });
    expect(onPatternSelect).toHaveBeenCalledTimes(1);
  });

  it("entries are focusable (tabIndex=0)", () => {
    render(<PatternLibraryPanel {...defaultProps} />);

    const listbox = screen.getByRole("listbox", { name: "Available rhythm patterns" });
    const options = within(listbox).getAllByRole("option");
    for (const option of options) {
      expect(option).toHaveAttribute("tabindex", "0");
    }
  });

  it("entries are not focusable when disabled (tabIndex=-1)", () => {
    render(<PatternLibraryPanel {...defaultProps} disabled={true} />);

    const listbox = screen.getByRole("listbox", { name: "Available rhythm patterns" });
    const options = within(listbox).getAllByRole("option");
    for (const option of options) {
      expect(option).toHaveAttribute("tabindex", "-1");
    }
  });

  it("does not call onPatternSelect when disabled", () => {
    const onPatternSelect = vi.fn();
    render(
      <PatternLibraryPanel {...defaultProps} onPatternSelect={onPatternSelect} disabled={true} />,
    );

    fireEvent.click(screen.getByText("Basic Rock"));
    expect(onPatternSelect).not.toHaveBeenCalled();
  });

  it("shows empty state message when no patterns are available", async () => {
    // Override module to return empty
    const genrePresetsModule = await import("../../audio/genrePresets");
    const getValidSpy = vi.spyOn(genrePresetsModule, "getValidPresets").mockReturnValue([]);

    render(<PatternLibraryPanel {...defaultProps} />);
    expect(screen.getByText("No patterns available.")).toBeInTheDocument();

    getValidSpy.mockRestore();
  });

  it("shows genre-specific empty state when filter yields zero results", async () => {
    const genrePresetsModule = await import("../../audio/genrePresets");
    const getByGenreSpy = vi.spyOn(genrePresetsModule, "getPresetsByGenre").mockReturnValue([]);

    render(<PatternLibraryPanel {...defaultProps} />);

    // Select a genre that will return empty
    fireEvent.click(screen.getByRole("button", { name: "Jazz" }));
    expect(
      screen.getByText("No patterns available for the selected genre."),
    ).toBeInTheDocument();

    getByGenreSpy.mockRestore();
  });

  it("filters patterns when a genre is selected", () => {
    render(<PatternLibraryPanel {...defaultProps} />);

    // Click the Jazz filter
    fireEvent.click(screen.getByRole("button", { name: "Jazz" }));

    // Should show jazz patterns
    expect(screen.getByText("Jazz Swing")).toBeInTheDocument();
    expect(screen.getByText("Bossa Nova")).toBeInTheDocument();

    // Should NOT show rock patterns
    expect(screen.queryByText("Basic Rock")).not.toBeInTheDocument();
    expect(screen.queryByText("Driving Rock")).not.toBeInTheDocument();
  });

  it("defaults genre filter to All showing all patterns", () => {
    render(<PatternLibraryPanel {...defaultProps} />);

    // Should show at least one pattern from multiple genres
    expect(screen.getByText("Basic Rock")).toBeInTheDocument();
    expect(screen.getByText("Boom Bap")).toBeInTheDocument();
    expect(screen.getByText("Four on the Floor")).toBeInTheDocument();
  });

  it("integrates GenreFilterBar component", () => {
    render(<PatternLibraryPanel {...defaultProps} />);
    expect(screen.getByRole("toolbar", { name: "Filter patterns by genre" })).toBeInTheDocument();
  });

  it("integrates VariationControlBar component", () => {
    render(<PatternLibraryPanel {...defaultProps} />);
    expect(
      screen.getByRole("toolbar", { name: "Overlay pattern variation controls" }),
    ).toBeInTheDocument();
  });

  it("disables variation controls when no pattern is selected", () => {
    render(<PatternLibraryPanel {...defaultProps} activePatternId={null} />);

    const variationToolbar = screen.getByRole("toolbar", {
      name: "Overlay pattern variation controls",
    });
    const buttons = within(variationToolbar).getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it("enables variation controls when a pattern is selected", () => {
    render(
      <PatternLibraryPanel {...defaultProps} activePatternId="rock-basic-4x4" />,
    );

    const variationToolbar = screen.getByRole("toolbar", {
      name: "Overlay pattern variation controls",
    });
    const buttons = within(variationToolbar).getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).not.toBeDisabled();
    }
  });

  it("displays tempo in BPM format for each entry", () => {
    render(<PatternLibraryPanel {...defaultProps} />);

    // 120 BPM for Basic Rock, 90 BPM for Boom Bap etc.
    expect(screen.getByText("120 BPM")).toBeInTheDocument();
    expect(screen.getByText("90 BPM")).toBeInTheDocument();
  });
});
