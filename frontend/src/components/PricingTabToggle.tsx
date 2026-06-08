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

export function PricingTabToggle({
  activeTab,
  onTabChange,
}: PricingTabToggleProps) {
  return (
    <div
      role="group"
      aria-label="Plan type"
      data-testid="pricing-tab-toggle"
      className="flex w-fit rounded-lg border border-border bg-secondary p-2xs"
    >
      <button
        type="button"
        aria-pressed={activeTab === "subscriptions"}
        data-testid="pricing-tab-subscriptions"
        onClick={() => onTabChange("subscriptions")}
        className={cn(
          "min-h-[44px] rounded-md px-lg py-xs text-sm font-medium transition-colors tap-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          activeTab === "subscriptions"
            ? "bg-primary-400/20 text-primary-200"
            : "text-muted-foreground hover:bg-muted hover:text-secondary-foreground",
        )}
      >
        Subscriptions
      </button>
      <button
        type="button"
        aria-pressed={activeTab === "packs"}
        data-testid="pricing-tab-credit-packs"
        onClick={() => onTabChange("packs")}
        className={cn(
          "min-h-[44px] rounded-md px-lg py-xs text-sm font-medium transition-colors tap-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
