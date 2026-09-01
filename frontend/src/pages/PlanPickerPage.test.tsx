import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PlanPickerPage } from "./PlanPickerPage";

const mockUserUpdate = vi.fn();
const mockStartCheckout = vi.fn();
let mockUnsafeMetadata: Record<string, unknown> = {};

vi.mock("@clerk/react", () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      update: mockUserUpdate,
      unsafeMetadata: mockUnsafeMetadata,
    },
  }),
}));

vi.mock("../hooks/useSubscription", () => ({
  useSubscription: () => ({
    startCheckout: mockStartCheckout,
    status: "inactive",
    plan: null,
    entitlementSource: "none",
    capabilities: {
      canSplitFourStems: false, canExpandToFourStems: false,
      canUsePremiumStemQualities: false, canUseBatchQueue: false,
      canDownloadFullPreview: false, canShareCleanPreview: false,
    },
    billingStatus: "none",
    billingError: null,
    openPortal: vi.fn(),
    refetch: vi.fn(),
  }),
}));

describe("PlanPickerPage", () => {
  beforeEach(() => {
    mockUserUpdate.mockReset();
    mockStartCheckout.mockReset();
    mockUnsafeMetadata = {};
  });

  it("renders hero subscription plans in the main grid", () => {
    render(<PlanPickerPage onComplete={vi.fn()} />);
    const subscribeSection = screen.getByText("Or subscribe monthly").parentElement;
    expect(subscribeSection).toBeTruthy();
    const grid = within(subscribeSection as HTMLElement);
    expect(grid.getByText("Premium")).toBeInTheDocument();
    expect(grid.getByText("Basic")).toBeInTheDocument();
    expect(grid.queryByText("Studio")).not.toBeInTheDocument();
  });

  it("surfaces the single-song pack prominently", () => {
    render(<PlanPickerPage onComplete={vi.fn()} />);
    expect(screen.getByText("Single Song Pack")).toBeInTheDocument();
    expect(screen.getByText("Best way to try your own song")).toBeInTheDocument();
  });

  it("renders the billing interval toggle", () => {
    render(<PlanPickerPage onComplete={vi.fn()} />);
    expect(screen.getByTestId("billing-interval-toggle")).toBeInTheDocument();
  });

  it("renders the Continue with Free button", () => {
    render(<PlanPickerPage onComplete={vi.fn()} />);
    expect(screen.getByText(/Continue with Free/)).toBeInTheDocument();
  });

  it("calls user.update and onComplete when Continue with Free is clicked", async () => {
    const onComplete = vi.fn();
    mockUnsafeMetadata = { firstSplitComplete: true };
    mockUserUpdate.mockResolvedValueOnce(undefined);
    render(<PlanPickerPage onComplete={onComplete} />);
    fireEvent.click(screen.getByText(/Continue with Free/));
    await waitFor(() => {
      expect(mockUserUpdate).toHaveBeenCalledWith({
        unsafeMetadata: { firstSplitComplete: true, planPickerSeen: true },
      });
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });

  it("starts checkout without marking the plan picker complete for paid plans", async () => {
    mockStartCheckout.mockResolvedValueOnce(undefined);
    render(<PlanPickerPage onComplete={vi.fn()} />);
    const premiumButton = screen.getByRole("button", { name: /Start Premium/ });
    fireEvent.click(premiumButton);
    await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledWith("premium", {
      source: "plan_picker",
      intent: "picker_premium",
      interval: "month",
    }));
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("keeps the picker open when a paid plan checkout does not redirect", async () => {
    const onComplete = vi.fn();
    mockStartCheckout.mockResolvedValueOnce(undefined);
    render(<PlanPickerPage onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Premium/ }));
    await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledOnce());
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("disables Continue with Free while a plan checkout is loading", async () => {
    mockStartCheckout.mockReturnValueOnce(new Promise(() => {}));
    render(<PlanPickerPage onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Premium/ }));
    expect(screen.getByText(/Continue with Free/)).toBeDisabled();
  });
});
