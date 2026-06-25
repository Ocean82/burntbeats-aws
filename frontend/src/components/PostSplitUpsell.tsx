import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { SUBSCRIPTION_PLANS } from "../data/plans";

interface PostSplitUpsellProps {
  isPaidUser: boolean;
  hasStems: boolean;
  onStartPremium: () => void;
  onViewPlans: () => void;
}

const DISMISSED_KEY = "burnt-beats-post-split-upsell-dismissed";

export function PostSplitUpsell({
  isPaidUser,
  hasStems,
  onStartPremium,
  onViewPlans,
}: PostSplitUpsellProps) {
  const premiumPlan = SUBSCRIPTION_PLANS.find((p) => p.id === "premium");
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "true");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!dismissed && hasStems && !isPaidUser) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [dismissed, hasStems, isPaidUser]);

  if (!visible) return null;

  return (
    <div className="relative rounded-xl border-l-4 border-l-primary-400 border border-border bg-muted/80 p-md">
      <button
        type="button"
        onClick={() => { setDismissed(true); setVisible(false); localStorage.setItem(DISMISSED_KEY, "true"); }}
        className="absolute right-2 top-2 rounded-lg p-1 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1 h-5 w-5 shrink-0 text-primary-400" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">Great split. Ready for the full studio?</p>
          <ul className="mt-1 space-y-0.5 text-xs text-secondary-foreground">
            <li>4-stem splits — isolate vocals, drums, bass, and melody</li>
            <li>HQ quality modes — cleaner separation</li>
            <li>Batch queue — process multiple tracks at once</li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onStartPremium}
              className="fire-button rounded-lg px-md py-1.5 text-xs font-semibold">
              {premiumPlan?.cta ?? "Start Premium"} · {premiumPlan?.priceLabel ?? "$15/mo"}
            </button>
            <button type="button" onClick={onViewPlans}
              className="ghost-button rounded-lg px-md py-1.5 text-xs font-semibold">
              See all plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
