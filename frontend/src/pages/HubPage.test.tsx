import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { HubPage } from "./HubPage";
import { getPrimaryTools, getSecondaryTools, getTool } from "../data/toolCatalog";

const navigate = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/", navigate],
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { firstName: "Test" } }),
}));

vi.mock("@/hooks/useStemHistory", () => ({
  useStemHistory: () => ({
    jobs: [],
    isLoading: false,
    totalJobs: 0,
  }),
}));

vi.mock("@/hooks/useMidiHistory", () => ({
  useMidiHistory: () => ({
    records: [],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useToolUsage", () => ({
  useToolUsage: () => ({
    touch: vi.fn(),
    hasUsed: () => false,
  }),
}));

describe("HubPage", () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it("renders primary and secondary tool cards from catalog", () => {
    render(<HubPage />);

    for (const tool of getPrimaryTools()) {
      expect(screen.getByText(tool.primaryName)).toBeInTheDocument();
    }

    for (const tool of getSecondaryTools()) {
      expect(screen.getByText(tool.primaryName)).toBeInTheDocument();
    }
  });

  it("shows nickname badges where defined", () => {
    render(<HubPage />);

    expect(screen.getByText("Rip it apart")).toBeInTheDocument();
    expect(screen.getByText("The Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Note Hunter")).toBeInTheDocument();
    expect(screen.getByText("Mic Fix")).toBeInTheDocument();
    expect(screen.getByText("Blueprint Rack")).toBeInTheDocument();
    expect(screen.getByText("The Vault")).toBeInTheDocument();
  });

  it("navigates beat templates to patterns focus route", () => {
    render(<HubPage />);

    fireEvent.click(screen.getByText(getTool("patterns").primaryName));
    expect(navigate).toHaveBeenCalledWith("/beats?tab=drums&focus=patterns");
  });
});
