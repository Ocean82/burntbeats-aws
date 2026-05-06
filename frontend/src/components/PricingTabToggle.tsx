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
    <div className="flex w-fit rounded-lg border border-white/10 bg-black/40 p-1">
      <button
        type="button"
        onClick={() => onTabChange("subscriptions")}
        className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
          activeTab === "subscriptions"
            ? "bg-amber-400/20 text-amber-200"
            : "text-white/60 hover:bg-white/5 hover:text-white/90"
        }`}
      >
        Subscriptions
      </button>
      <button
        type="button"
        onClick={() => onTabChange("packs")}
        className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
          activeTab === "packs"
            ? "bg-amber-400/20 text-amber-200"
            : "text-white/60 hover:bg-white/5 hover:text-white/90"
        }`}
      >
        Credit Packs
      </button>
    </div>
  );
}
