import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell.component";

describe("AppShell", () => {
  it("renders children inside the root error boundary", () => {
    render(
      <AppShell>
        <span data-testid="shell-child">nested</span>
      </AppShell>
    );
    expect(screen.getByTestId("shell-child")).toHaveTextContent("nested");
  });
});
