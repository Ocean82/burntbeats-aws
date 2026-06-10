import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StepProgressIndicator, deriveSteps } from "../StepProgressIndicator";
import type { AppPhase } from "@/types/phases";

describe("StepProgressIndicator", () => {
  it("renders all 4 phase labels when not in workspace phase", () => {
    render(<StepProgressIndicator phase="upload" />);

    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Configure")).toBeInTheDocument();
    expect(screen.getByText("Splitting")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("returns null when phase is workspace (Req 7.3)", () => {
    const { container } = render(<StepProgressIndicator phase="workspace" />);
    expect(container.innerHTML).toBe("");
  });

  it("has data-testid attribute", () => {
    render(<StepProgressIndicator phase="upload" />);
    expect(screen.getByTestId("step-progress-indicator")).toBeInTheDocument();
  });

  it("is not interactive — no buttons rendered (Req 7.4)", () => {
    render(<StepProgressIndicator phase="configure" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("has role=list with appropriate aria-label", () => {
    render(<StepProgressIndicator phase="splitting" />);
    const list = screen.getByRole("list", { name: /split flow progress/i });
    expect(list).toBeInTheDocument();
  });

  it("renders listitems for each phase", () => {
    render(<StepProgressIndicator phase="upload" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
  });
});

describe("deriveSteps", () => {
  it("marks all steps as upcoming when phase is upload (first phase)", () => {
    const steps = deriveSteps("upload");
    expect(steps[0].state).toBe("active");
    expect(steps[1].state).toBe("upcoming");
    expect(steps[2].state).toBe("upcoming");
    expect(steps[3].state).toBe("upcoming");
  });

  it("marks upload as completed and configure as active", () => {
    const steps = deriveSteps("configure");
    expect(steps[0].state).toBe("completed");
    expect(steps[1].state).toBe("active");
    expect(steps[2].state).toBe("upcoming");
    expect(steps[3].state).toBe("upcoming");
  });

  it("marks upload + configure as completed and splitting as active", () => {
    const steps = deriveSteps("splitting");
    expect(steps[0].state).toBe("completed");
    expect(steps[1].state).toBe("completed");
    expect(steps[2].state).toBe("active");
    expect(steps[3].state).toBe("upcoming");
  });

  it("marks all preceding as completed and workspace as active", () => {
    const steps = deriveSteps("workspace");
    expect(steps[0].state).toBe("completed");
    expect(steps[1].state).toBe("completed");
    expect(steps[2].state).toBe("completed");
    expect(steps[3].state).toBe("active");
  });

  it("returns correct labels for all phases", () => {
    const phases: AppPhase[] = ["upload", "configure", "splitting", "workspace"];
    for (const phase of phases) {
      const steps = deriveSteps(phase);
      expect(steps.map((s) => s.label)).toEqual([
        "Upload",
        "Configure",
        "Splitting",
        "Workspace",
      ]);
    }
  });

  it("returns correct ids for all steps", () => {
    const steps = deriveSteps("upload");
    expect(steps.map((s) => s.id)).toEqual([
      "upload",
      "configure",
      "splitting",
      "workspace",
    ]);
  });
});
