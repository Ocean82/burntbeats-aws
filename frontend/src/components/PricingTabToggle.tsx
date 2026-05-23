/**
 * Shared tab toggle for switching between Subscriptions and Credit Packs.
 * Used by PricingPage and LandingPage.
 */
import type { PricingTableType } from "../data/plans";
import { cn } from "../utils/cn";

interface PricingTabToggleProps {
  activeTab: PricingTableType;
  onTabChange: (tab: PricingTableType) => void;
}

export function PricingTabToggle({ activeTab, onTabChange }: PricingTabToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Plan type"
      data-testid="pricing-tab-toggle"
      className="flex w-fit rounded-lg border border-border bg-secondary p-2xs"
    >
      <button
        type="button"
        role="tab"
        id="pricing-tab-subscriptions"
        aria-selected={activeTab === "subscriptions"}
        aria-controls="pricing-tabpanel-plans"
        data-testid="pricing-tab-subscriptions"
        onClick={() => onTabChange("subscriptions")}
        className={cn(
          "min-h-[44px] rounded-md px-lg py-xs text-sm font-medium transition-colors tap-feedback",
          activeTab === "subscriptions"
            ? "bg-primary-400/20 text-primary-200"
            : "text-muted-foreground hover:bg-muted hover:text-secondary-foreground",
        )}
      >
        Subscriptions
      </button>
      <button
        type="button"
        role="tab"
        id="pricing-tab-credit-packs"
        aria-selected={activeTab === "packs"}
        aria-controls="pricing-tabpanel-plans"
        data-testid="pricing-tab-credit-packs"
        onClick={() => onTabChange("packs")}
        className={cn(
          "min-h-[44px] rounded-md px-lg py-xs text-sm font-medium transition-colors tap-feedback",
          activeTab === "packs"
            ? "bg-primary-400/20 text-primary-200"
            : "text-muted-foreground hover:bg-muted hover:text-secondary-foreground",
        )}
      >
        Credit Packs
      </button>
    </div>
  );
}
