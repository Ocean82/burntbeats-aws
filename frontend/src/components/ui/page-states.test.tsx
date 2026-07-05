import { render, screen } from "@testing-library/react";
import { Mic2 } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { Skeleton } from "./skeleton";

describe("page state primitives", () => {
  it("renders empty state action", () => {
    render(
      <EmptyState
        icon={<Mic2 className="h-6 w-6" />}
        title="Test"
        description="Desc"
        action={{ label: "Go", onClick: () => {} }}
      />,
    );
    expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
  });

  it("renders error state with retry", () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        variant="server"
        title="Failed"
        description="Something broke"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    screen.getByRole("button", { name: /try again/i }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders skeleton placeholder", () => {
    render(<Skeleton data-testid="page-state-skeleton" className="h-8 w-full" />);
    expect(screen.getByTestId("page-state-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("page-state-skeleton")).toHaveAttribute("aria-busy", "true");
  });
});
