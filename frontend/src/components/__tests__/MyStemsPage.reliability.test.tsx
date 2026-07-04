/**
 * Unit tests for MyStemsPage EmptyState wiring.
 *
 * Validates: Requirements 12.1, 12.2, 12.3
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react"
import { screen } from "@testing-library/dom";
import { MyStemsPage } from "../MyStemsPage";

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

vi.mock("../../hooks/useStemHistory", () => ({
  useStemHistory: () => ({
    jobs: [],
    isLoading: false,
    error: null,
    totalJobs: 0,
    totalStems: 0,
    totalStorageBytes: 0,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../hooks/useMidiHistory", () => ({
  useMidiHistory: () => ({
    records: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Stub out motion to avoid animation noise in tests
vi.mock("framer-motion", async (importOriginal: any) => {
  const actual = await importOriginal();
  return {
    ...actual,
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...props}>{children}</div>
      ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

// Stub SharePreviewButton (renders in card — not needed here)
vi.mock("../SharePreviewButton", () => ({
  SharePreviewButton: () => null,
}));

// Stub MyStemsPageSkeleton
vi.mock("../MyStemsPageSkeleton", () => ({
  MyStemsPageSkeleton: () => <div data-testid="skeleton">Loading…</div>,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MyStemsPage EmptyState wiring", () => {
  it("renders EmptyState with Archive icon area when totalJobs is 0 and not loading", () => {
    render(<MyStemsPage onClose={vi.fn()} />);

    // Title from the EmptyState
    expect(screen.getByText("No tracks yet")).toBeInTheDocument();
  });

  it("renders the split-your-first-song action button when totalJobs is 0", () => {
    render(<MyStemsPage onClose={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /split your first song/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when the split-your-first-song button is clicked", async () => {
    const onClose = vi.fn();
    render(<MyStemsPage onClose={onClose} />);

    screen.getByRole("button", { name: /split your first song/i }).click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
