/**
 * Shared tab toggle for switching between Subscriptions and Credit Packs.
 * Used by PricingPage and LandingPage.
 */
import type { PricingTableType } from "../data/plans";

interface PricingTabToggleProps {
  activeTab: PricingTableType;
  onTabChange: (tab: PricingTableType) => void;
}

export function PricingTabToggle({ activeTab, onTabChange }: PricingTabToggleProps) {
  return (
    <div className="flex w-fit rounded-lg border border-border bg-secondary p-2xs">
      <button
        type="button"
        onClick={() => onTabChange("subscriptions")}
        className={`rounded-md px-lg py-xs text-sm font-medium transition-colors ${
          activeTab === "subscriptions"
            ? "bg-primary-400/20 text-primary-200"
            : "text-muted-foreground hover:bg-muted hover:text-secondary-foreground"
        }`}
      >
        Subscriptions
      </button>
      <button
        type="button"
        onClick={() => onTabChange("packs")}
        className={`rounded-md px-lg py-xs text-sm font-medium transition-colors ${
          activeTab === "packs"
            ? "bg-primary-400/20 text-primary-200"
            : "text-muted-foreground hover:bg-muted hover:text-secondary-foreground"
        }`}
      >
        Credit Packs
      </button>
    </div>
  );
}
