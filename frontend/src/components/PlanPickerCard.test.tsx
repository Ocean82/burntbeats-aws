import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanPickerCard } from "./PlanPickerCard";
import type { PlanConfig } from "../data/plans";

const basicPlan: PlanConfig = {
  id: "basic",
  name: "Basic",
  priceLabel: "$9/month",
  description: "Light plan",
  details: ["120 tokens", "2-stem split", "Mixer and export"],
  highlight: false,
  cta: "Start Basic",
};

const premiumPlan: PlanConfig = {
  ...basicPlan,
  id: "premium",
  name: "Premium",
  priceLabel: "$15/month",
  description: "Full workstation",
  details: ["300 tokens", "4-stem split", "All features"],
  highlight: true,
  cta: "Start Premium",
};

describe("PlanPickerCard", () => {
  it("renders plan name, price, description, and features", () => {
    render(<PlanPickerCard plan={basicPlan} onSelect={vi.fn()} />);
    expect(screen.getByText("Basic")).toBeInTheDocument();
    expect(screen.getByText("$9/month")).toBeInTheDocument();
    expect(screen.getByText("Light plan")).toBeInTheDocument();
    expect(screen.getByText("120 tokens")).toBeInTheDocument();
    expect(screen.getByText("2-stem split")).toBeInTheDocument();
  });

  it("shows 'Most popular' badge when highlighted", () => {
    render(<PlanPickerCard plan={premiumPlan} isHighlighted={true} onSelect={vi.fn()} />);
    expect(screen.getByText("Most popular")).toBeInTheDocument();
  });

  it("does not show 'Most popular' badge when not highlighted", () => {
    render(<PlanPickerCard plan={basicPlan} onSelect={vi.fn()} />);
    expect(screen.queryByText("Most popular")).not.toBeInTheDocument();
  });

  it("fires onSelect when CTA button is clicked", () => {
    const onSelect = vi.fn();
    render(<PlanPickerCard plan={basicPlan} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Basic/ }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("disables the button while loading", () => {
    render(<PlanPickerCard plan={basicPlan} onSelect={vi.fn()} isLoading={true} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
