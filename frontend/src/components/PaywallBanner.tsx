/**
 * PaywallBanner: shown when the user has no active subscription.
 * Presents packs and subscription tiers; redirects to Stripe Checkout on selection.
 */
import { Loader2, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { Plan, UseSubscriptionResult } from "../hooks/useSubscription";
import {
  PACK_PLANS,
  SUBSCRIPTION_PLANS,
  WORKSTATION_VALUE_LINE,
} from "../data/plans";
import { cn } from "../utils/cn";
import { trackEvent } from "../analytics/events";
import { BillingRules } from "./BillingRules";

interface PaywallBannerProps {
  subscription: UseSubscriptionResult;
  /** "full" shows all plan cards; "teaser" shows a compact CTA linking to Plans tab */
  variant?: "full" | "teaser";
  /** Callback when user clicks "View all plans" (teaser variant) */
  onViewPlans?: () => void;
}

export function PaywallBanner({ subscription, variant = "full", onViewPlans }: PaywallBannerProps) {
  const [loading, setLoading] = useState<Plan | null>(null);

  useEffect(() => {
    trackEvent("paywall_impression", {
      source: variant === "teaser" ? "teaser" : "split_gate",
      status: subscription.status,
      current_plan: subscription.plan ?? "none",
    });
  }, [subscription.plan, subscription.status, variant]);

  const handleCheckout = async (plan: Plan, source: string, intent?: string) => {
    trackEvent("paywall_cta_clicked", { source, plan });
    setLoading(plan);
    try {
      await subscription.startCheckout(plan, {
        source: source === "teaser" ? "paywall_banner" : "split_gate",
        intent: intent ?? `${source}_checkout`,
      });
    } finally {
      setLoading(null);
    }
  };

  // ── Teaser variant: compact CTA ──
  if (variant === "teaser") {
    return (
      <div className="flex flex-col items-center gap-sm py-xs sm:flex-row sm:justify-between">
        <p className="text-readable text-sm text-secondary-foreground">
          <span className="font-semibold text-secondary-foreground">
            Unlock the full workstation.
          </span>{" "}
          From $0.99 per song or $15/mo for Premium.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-xs">
          <button
            type="button"
            onClick={() => void handleCheckout("single", "teaser", "teaser_single_pack")}
            disabled={loading !== null}
            className="ghost-button flex min-h-[40px] items-center gap-xs px-md py-xs text-xs font-semibold disabled:opacity-60"
          >
            {loading === "single" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Try one song · $0.99
          </button>
          <button
            type="button"
            onClick={() => void handleCheckout("premium", "teaser", "teaser_premium_sub")}
            disabled={loading !== null}
            className="fire-button flex min-h-[40px] items-center gap-xs px-md py-xs text-xs font-semibold disabled:opacity-60"
          >
            {loading === "premium" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Start Premium
          </button>
          {onViewPlans && (
            <button
              type="button"
              onClick={onViewPlans}
              className="ghost-button flex min-h-[40px] items-center gap-xs px-md py-xs text-xs font-semibold"
            >
              View all plans
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Full variant ──
  const handleSelect = async (plan: Plan, intent: string) => {
    trackEvent("paywall_cta_clicked", {
      source: "split_gate",
      plan,
    });
    setLoading(plan);
    try {
      await subscription.startCheckout(plan, {
        source: "paywall_banner",
        intent,
      });
    } finally {
      setLoading(null);
    }
  };

  const singlePack = PACK_PLANS.find((p) => p.id === "single");
  const topupPack = PACK_PLANS.find((p) => p.id === "topup");

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-2xs text-center">
        <p className="text-sm font-semibold text-secondary-foreground">Choose a plan to get started</p>
        <p className="text-readable text-sm text-muted-foreground">{WORKSTATION_VALUE_LINE}</p>
      </div>

      <BillingRules />

      <div className="grid gap-xs sm:grid-cols-3">
        <button
          type="button"
          onClick={() => void handleSelect("premium", "blocked_split_checkout_premium")}
          disabled={loading !== null}
          aria-label="Start Premium subscription"
          aria-live="polite"
          className={cn(
            "fire-button flex min-h-[48px] w-full items-center justify-center gap-xs px-md py-sm text-sm font-semibold sm:col-span-1",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {loading === "premium" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting...
            </>
          ) : (
            "Start Premium · $15/mo"
          )}
        </button>
        <button
          type="button"
          onClick={() => void handleSelect("single", "blocked_split_checkout_single")}
          disabled={loading !== null}
          aria-label="Buy single song pack"
          className="ghost-button min-h-[48px] w-full px-md py-sm text-sm font-semibold disabled:opacity-60"
        >
          {loading === "single" ? (
            <span className="inline-flex items-center justify-center gap-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting...
            </span>
          ) : (
            `Try one song · ${singlePack?.priceLabel ?? "$0.99"}`
          )}
        </button>
        <button
          type="button"
          onClick={() => void handleSelect("topup", "blocked_split_checkout_topup")}
          disabled={loading !== null}
          aria-label="Buy one-time top-up credits"
          className="ghost-button min-h-[48px] w-full px-md py-sm text-sm font-semibold disabled:opacity-60"
        >
          {loading === "topup" ? (
            <span className="inline-flex items-center justify-center gap-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting...
            </span>
          ) : (
            `Top-Up · ${topupPack?.priceLabel ?? "$5"} (60 min)`
          )}
        </button>
      </div>

      <div className="flex flex-col gap-sm">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => void handleSelect(plan.id, `blocked_split_checkout_${plan.id}`)}
            disabled={loading !== null || (subscription.status === "active" && subscription.plan === plan.id)}
            aria-label={
              subscription.status === "active" && subscription.plan === plan.id
                ? `${plan.name} plan is your current plan`
                : `Choose ${plan.name} plan`
            }
            className={cn(
              "flex items-center justify-between rounded-xl border px-md py-md text-left transition",
              "border-border bg-muted hover:border-primary-400/40 hover:bg-primary-500/10",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60",
              plan.highlight && "border-primary-400/30 bg-primary-500/10",
            )}
          >
            <div className="min-w-0 flex flex-col gap-2xs">
              <span className="text-sm font-semibold text-foreground">
                {plan.name}
                {plan.highlight && (
                  <span className="ml-2 rounded-full bg-primary-500/30 px-xs py-0.5 text-xs text-primary-200">
                    Popular
                  </span>
                )}
              </span>
              <span className="text-readable text-sm text-muted-foreground">{plan.details.slice(0, 3).join(" · ")}</span>
            </div>
            <div className="flex shrink-0 items-center gap-xs pl-md">
              <span className="text-sm font-semibold text-primary-300">{plan.priceLabel}</span>
              {loading === plan.id && <Loader2 className="h-4 w-4 animate-spin text-primary-300" />}
            </div>
          </button>
        ))}
      </div>

      <p className="text-readable text-center text-xs text-muted-foreground">
        Not ready for Premium? Single and Top-Up packs unlock the workstation with no subscription.
      </p>
    </div>
  );
}
