/**
 * PaywallBanner: shown when the user has no active subscription.
 * Presents the three plan tiers and redirects to Stripe Checkout on selection.
 */
import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { Plan, UseSubscriptionResult } from "../hooks/useSubscription";
import { cn } from "../utils/cn";

interface PaywallBannerProps {
  subscription: UseSubscriptionResult;
}

const PLANS: { id: Plan; label: string; price: string; features: string[] }[] = [
  {
    id: "basic",
    label: "Basic",
    price: "$9/mo",
    features: ["Monthly token allowance (see plan)", "2-stem · Speed only", "Waveform mixer + WAV export"],
  },
  {
    id: "premium",
    label: "Premium",
    price: "$19/mo",
    features: ["Higher token allowance", "2-stem then 4-stem expand", "Speed + Quality · waveform", "Batch queue"],
  },
  {
    id: "studio",
    label: "Studio",
    price: "$39/mo",
    features: ["Everything in Premium", "Ultra quality tier", "Priority processing"],
  },
];

export function PaywallBanner({ subscription }: PaywallBannerProps) {
  const [loading, setLoading] = useState<Plan | null>(null);

  const handleSelect = async (plan: Plan) => {
    setLoading(plan);
    try {
      await subscription.startCheckout(plan);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 text-center">
        <p className="text-sm font-semibold text-white/90">Choose a plan to get started</p>
        <p className="text-xs text-white/50">Subscriptions renew monthly; usage is token-based on song length — cancel anytime.</p>
      </div>

      <div className="flex flex-col gap-3">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => void handleSelect(plan.id)}
            disabled={loading !== null}
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3 text-left transition",
              "border-white/10 bg-white/5 hover:border-amber-400/40 hover:bg-amber-500/10",
              "disabled:opacity-60",
              plan.id === "premium" && "border-amber-400/30 bg-amber-500/10",
            )}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-white/90">
                {plan.label}
                {plan.id === "premium" && (
                  <span className="ml-2 rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] text-amber-200">
                    Popular
                  </span>
                )}
              </span>
              <span className="text-xs text-white/50">{plan.features.join(" · ")}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-4">
              <span className="text-sm font-semibold text-amber-300">{plan.price}</span>
              {loading === plan.id && <Loader2 className="h-4 w-4 animate-spin text-amber-300" />}
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-white/30">
        Need a one-time top-up?{" "}
        <button
          type="button"
          onClick={() => void handleSelect("topup")}
          disabled={loading !== null}
          className="text-white/50 underline hover:text-white/80 disabled:opacity-60"
        >
          Buy credits
        </button>
      </p>
    </div>
  );
}
