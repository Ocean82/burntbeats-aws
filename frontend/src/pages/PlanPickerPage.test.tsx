import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PlanPickerPage } from "./PlanPickerPage";

const mockUserUpdate = vi.fn();
const mockStartCheckout = vi.fn();

vi.mock("@clerk/react", () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      update: mockUserUpdate,
      unsafeMetadata: {},
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
    mockUserUpdate.mockResolvedValueOnce(undefined);
    render(<PlanPickerPage onComplete={onComplete} />);
    fireEvent.click(screen.getByText(/Continue with Free/));
    await waitFor(() => {
      expect(mockUserUpdate).toHaveBeenCalledWith({
        unsafeMetadata: { planPickerSeen: true },
      });
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });

  it("calls user.update then startCheckout when a paid plan is selected", async () => {
    mockUserUpdate.mockResolvedValueOnce(undefined);
    mockStartCheckout.mockResolvedValueOnce(undefined);
    render(<PlanPickerPage onComplete={vi.fn()} />);
    const premiumButton = screen.getByRole("button", { name: /Start Premium/ });
    fireEvent.click(premiumButton);
    await waitFor(() => {
      expect(mockUserUpdate).toHaveBeenCalledWith({
        unsafeMetadata: { planPickerSeen: true },
      });
    });
    expect(mockStartCheckout).toHaveBeenCalledWith("premium", {
      source: "plan_picker",
      intent: "picker_premium",
      interval: "month",
    });
  });

  it("calls onComplete after a paid plan checkout resolves", async () => {
    const onComplete = vi.fn();
    mockUserUpdate.mockResolvedValueOnce(undefined);
    mockStartCheckout.mockResolvedValueOnce(undefined);
    render(<PlanPickerPage onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Premium/ }));
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });

  it("disables Continue with Free while a plan checkout is loading", async () => {
    mockUserUpdate.mockResolvedValueOnce(undefined);
    mockStartCheckout.mockReturnValueOnce(new Promise(() => {}));
    render(<PlanPickerPage onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Premium/ }));
    expect(screen.getByText(/Continue with Free/)).toBeDisabled();
  });
});
