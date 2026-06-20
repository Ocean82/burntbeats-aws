import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolSidebar } from "./ToolSidebar";

describe("ToolSidebar", () => {
  const labels = ["Pitch", "EQ", "Time Stretch", "Amplitude", "FX", "Analyze"];

  it("renders 6 tool buttons with accessible labels", () => {
    render(<ToolSidebar activeTool={null} onToolToggle={() => {}} />);

    for (const label of labels) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });

  it("marks only the active tool button as pressed", () => {
    render(<ToolSidebar activeTool="eq" onToolToggle={() => {}} />);

    expect(screen.getByRole("button", { name: "EQ" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pitch" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "FX" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onToolToggle with the correct tool when a button is clicked", () => {
    const onToolToggle = vi.fn();
    render(<ToolSidebar activeTool={null} onToolToggle={onToolToggle} />);

    fireEvent.click(screen.getByRole("button", { name: "Time Stretch" }));
    expect(onToolToggle).toHaveBeenCalledWith("timeStretch");

    fireEvent.click(screen.getByRole("button", { name: "FX" }));
    expect(onToolToggle).toHaveBeenCalledWith("fx");
  });

  it("applies active styling to the active button", () => {
    render(<ToolSidebar activeTool="amplitude" onToolToggle={() => {}} />);

    const activeBtn = screen.getByRole("button", { name: "Amplitude" });
    expect(activeBtn.className).toContain("bg-primary/20");
    expect(activeBtn.className).toContain("text-primary");
  });

  it("renders as a vertical layout by default", () => {
    render(<ToolSidebar activeTool={null} onToolToggle={() => {}} />);
    const nav = screen.getByTestId("tool-sidebar");
    expect(nav.className).toContain("flex-col");
  });

  it("renders as a horizontal layout when horizontal prop is true", () => {
    render(<ToolSidebar activeTool={null} onToolToggle={() => {}} horizontal />);
    const nav = screen.getByTestId("tool-sidebar");
    expect(nav.className).toContain("flex-row");
  });

  it("uses TOOL_SIDEBAR_WIDTH for its width (vertical mode)", () => {
    render(<ToolSidebar activeTool={null} onToolToggle={() => {}} />);
    const nav = screen.getByTestId("tool-sidebar");
    expect(nav.style.width).toBe("64px");
  });

  it("uses TOOL_SIDEBAR_WIDTH for its height (horizontal mode)", () => {
    render(<ToolSidebar activeTool={null} onToolToggle={() => {}} horizontal />);
    const nav = screen.getByTestId("tool-sidebar");
    expect(nav.style.height).toBe("64px");
  });

  it("has no active button when activeTool is null", () => {
    render(<ToolSidebar activeTool={null} onToolToggle={() => {}} />);
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("has an accessible nav landmark with label", () => {
    render(<ToolSidebar activeTool={null} onToolToggle={() => {}} />);
    expect(screen.getByRole("navigation", { name: "Audio tools" })).toBeInTheDocument();
  });
});
