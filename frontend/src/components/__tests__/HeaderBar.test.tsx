import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeaderBar } from "../HeaderBar";

describe("HeaderBar", () => {
  it("renders with data-testid", () => {
    render(<HeaderBar phase="upload" />);
    expect(screen.getByTestId("header-bar")).toBeInTheDocument();
  });

  it("renders branding with logo and text", () => {
    render(<HeaderBar phase="upload" />);
    const header = screen.getByTestId("header-bar");
    expect(header.querySelector("img")).toHaveAttribute("src", "/logo-emblem.png");
    expect(screen.getByText("Burnt Beats")).toBeInTheDocument();
  });

  it("has aria-label for accessibility", () => {
    render(<HeaderBar phase="upload" />);
    expect(screen.getByRole("banner", { name: /burnt beats/i })).toBeInTheDocument();
  });

  it("renders step progress indicator when not in workspace phase", () => {
    render(<HeaderBar phase="configure" />);
    expect(screen.getByTestId("step-progress-indicator")).toBeInTheDocument();
  });

  it("does not render step progress indicator in workspace phase (Req 7.3)", () => {
    render(<HeaderBar phase="workspace" />);
    expect(screen.queryByTestId("step-progress-indicator")).not.toBeInTheDocument();
  });

  it("renders account area placeholder", () => {
    render(<HeaderBar phase="upload" />);
    expect(screen.getByLabelText("Account")).toBeInTheDocument();
  });

  it("uses HEADER_HEIGHT for height styling", () => {
    render(<HeaderBar phase="upload" />);
    const header = screen.getByTestId("header-bar");
    expect(header.style.height).toBe("56px");
  });
});
