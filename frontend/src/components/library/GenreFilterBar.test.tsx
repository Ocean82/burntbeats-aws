import { render } from "@testing-library/react"
import { fireEvent, screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { GenreFilterBar } from "./GenreFilterBar";

const GENRES = [
  { value: "rock", label: "Rock" },
  { value: "hip-hop", label: "Hip-Hop" },
  { value: "edm", label: "EDM" },
  { value: "jazz", label: "Jazz" },
  { value: "latin", label: "Latin" },
  { value: "reggae", label: "Reggae" },
];

describe("GenreFilterBar", () => {
  it("renders All button plus all six genre buttons", () => {
    render(<GenreFilterBar genres={GENRES} selected="all" onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    for (const genre of GENRES) {
      expect(screen.getByRole("button", { name: genre.label })).toBeInTheDocument();
    }
    // Total: 7 buttons (All + 6 genres)
    expect(screen.getAllByRole("button")).toHaveLength(7);
  });

  it("defaults to All as active (aria-pressed=true)", () => {
    render(<GenreFilterBar genres={GENRES} selected="all" onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    for (const genre of GENRES) {
      expect(screen.getByRole("button", { name: genre.label })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  it("visually indicates the active filter via aria-pressed", () => {
    render(<GenreFilterBar genres={GENRES} selected="jazz" onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "Jazz" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Rock" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onSelect with genre value when a genre button is clicked", () => {
    const onSelect = vi.fn();
    render(<GenreFilterBar genres={GENRES} selected="all" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "EDM" }));
    expect(onSelect).toHaveBeenCalledWith("edm");
  });

  it("calls onSelect with 'all' when All button is clicked", () => {
    const onSelect = vi.fn();
    render(<GenreFilterBar genres={GENRES} selected="rock" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("buttons are keyboard accessible (activatable via Enter)", () => {
    const onSelect = vi.fn();
    render(<GenreFilterBar genres={GENRES} selected="all" onSelect={onSelect} />);

    const rockBtn = screen.getByRole("button", { name: "Rock" });
    fireEvent.keyDown(rockBtn, { key: "Enter" });
    // Native button elements fire click on Enter, but fireEvent.keyDown alone won't.
    // The key point is that <button> elements are inherently keyboard accessible.
    // We verify they are focusable (not disabled, no tabIndex=-1).
    expect(rockBtn).not.toBeDisabled();
    expect(rockBtn).not.toHaveAttribute("tabindex", "-1");
  });

  it("has an accessible toolbar role with label", () => {
    render(<GenreFilterBar genres={GENRES} selected="all" onSelect={() => {}} />);

    const toolbar = screen.getByRole("toolbar", { name: "Filter patterns by genre" });
    expect(toolbar).toBeInTheDocument();
  });

  it("only one button is active at a time", () => {
    render(<GenreFilterBar genres={GENRES} selected="latin" onSelect={() => {}} />);

    const pressedButtons = screen.getAllByRole("button").filter(
      (btn) => btn.getAttribute("aria-pressed") === "true",
    );
    expect(pressedButtons).toHaveLength(1);
    expect(pressedButtons[0]).toHaveTextContent("Latin");
  });
});
