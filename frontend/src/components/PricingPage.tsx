import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import type { Plan, UseSubscriptionResult } from "../hooks/useSubscription";
import {
  PricingTablePreview,
  type PlanConfig as PricingTablePlanConfig,
} from "./PricingTablePreview";
import { BillingRules } from "./BillingRules";
import { trackEvent } from "../analytics/events";

interface UsageContext {
  hasCompletedFirstExport?: boolean;
  splitsThisSession?: number;
}

interface PricingPageProps {
  subscription: UseSubscriptionResult;
  onClose: () => void;
  usageContext?: UsageContext;
}

interface PlanConfig {
  id: Plan;
  name: string;
  priceLabel: string;
  badge?: string;
  highlight?: "primary" | "outline";
  description: string;
  details: string[];
  emphasis?: boolean;
  cta: string;
}

const PLANS: PlanConfig[] = [
  {
    id: "single",
    name: "Single Song Pack",
    priceLabel: "$0.99 pay as you go",
    badge: "Best for trying",
    description: "Enough for one basic song split. No subscription required.",
    details: [
      "4 tokens (enough for ~4 mins of audio).",
      "Perfect for trying Burnt Beats on a single track.",
      "No recurring charges, ever.",
      "Standard quality stems.",
      "Unlimited purchases",
      "Karaoke style split",
    ],
    cta: "Buy Single Pack",
  },
  {
    id: "topup",
    name: "Top‑Up Pack",
    priceLabel: "$5 pay as you go",
    badge: "Most flexible",
    emphasis: true,
    highlight: "primary",
    description: "Perfect if you only need stems occasionally.",
    details: [
      "One‑time purchase of tokens — no recurring charge.",
      "Use the same high‑quality stem engine if already on monthly plans.",
      "Great for guests and collaborators.",
      "Top up again any time you run low.",
      "No plan required for karaoke splits.",
    ],
    cta: "Buy Top‑Up Pack",
  },
  {
    id: "basic",
    name: "Basic",
    priceLabel: "$9/month",
    badge: "Starter",
    description:
      "For artists who want a steady trickle of sessions every month.",
    details: [
      "120 tokens/month (1 token = 1 minute).",
      "2 high‑quality stems (Vocal + Instruments).",
      "Great for Karaoke splits",
      "Priority processing over free traffic.",
      "Mixer / editor functions included.",
    ],
    cta: "Start Basic",
  },
  {
    id: "premium",
    name: "Premium",
    priceLabel: "$15/month",
    badge: "Most popular",
    highlight: "primary",
    description: "For active producers bouncing between projects all week.",
    details: [
      "300 tokens/month (1 token = 1 minute).",
      "Higher-quality selections available.",
      "High‑quality multi‑stem options (4 stems).",
      "Priority processing and batch tools unlocked.",
      "Full mixer / editor functions and pro mixing tools.",
    ],
    cta: "Start Premium",
  },
  {
    id: "studio",
    name: "Studio",
    priceLabel: "$25/month",
    badge: "For power users",
    description: "For studios, engineers, and heavy hitters who live in stems.",
    details: [
      "600 tokens/month (1 token = 1 minute).",
      "Highest quality stem options and full multi‑stem support.",
      "Priority listing in queues.",
      "Bonus tokens awarded regularly.",
      "Beta feature previews.",
    ],
    cta: "Start Studio",
  },
];

export function PricingPage({
  subscription,
  onClose,
  usageContext,
}: PricingPageProps) {
  const reduceMotion = useReducedMotion();
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<Plan | null>(
    null,
  );
  const [pricingTab, setPricingTab] = useState<"subscriptions" | "packs">(
    "subscriptions",
  );
  const handleSelectPlan = (plan: Plan) => {
    trackEvent("pricing_plan_selected", {
      source: "pricing_page",
      plan,
    });
    setCheckoutLoadingPlan(plan);
    void subscription.startCheckout(plan, {
      source: "pricing_page",
      intent: "pricing_page_cta",
    }).finally(() => {
      setCheckoutLoadingPlan(null);
    });
  };
  const showPrimaryCheckout = subscription.status !== "active";

  const renderCheckoutCTA = (plan: PricingTablePlanConfig) => (
    <button
      onClick={() => handleSelectPlan(plan.id as Plan)}
      disabled={
        subscription.status === "loading" || checkoutLoadingPlan !== null
      }
      className="w-full rounded-lg border border-amber-400/30 bg-amber-500/20 px-4 py-3 font-medium text-amber-200 transition hover:border-amber-400/50 hover:bg-amber-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {checkoutLoadingPlan === plan.id ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Redirecting...
        </span>
      ) : (
        plan.cta
      )}
    </button>
  );

  return (
    <div className="relative mx-auto flex w-full max-w-[1200px] flex-col gap-10 overflow-x-clip px-3 py-4 sm:px-6 lg:px-8">
      {/* Wayfinding: in-app pricing view — always offer an explicit path back without browser Back */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
      >
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/70">
          <li className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="group inline-flex min-h-[44px] min-w-0 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-amber-200/95 transition hover:border-amber-400/35 hover:bg-amber-500/10 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/50"
            >
              <ArrowLeft
                className="h-4 w-4 shrink-0 text-amber-300/90 transition group-hover:-translate-x-0.5"
                aria-hidden
              />
              <span className="font-medium">Back to editor</span>
            </button>
          </li>
          <li aria-hidden="true" className="text-white/30">
            /
          </li>
          <li className="min-w-0 truncate text-white/55" aria-current="page">
            Pricing &amp; plans
          </li>
        </ol>
        <p className="text-[11px] leading-snug text-white/45 sm:max-w-sm sm:text-right">
          Same as <span className="text-white/55">Back to editor</span> in the
          header — no need for the browser Back button.
        </p>
      </nav>

      {/* Header / hero */}
      <section className="glass-panel mirror-sheen rounded-[2rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="eyebrow text-amber-200/90">Pricing & plans</p>
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Pick your plan and start splitting in minutes.
            </h1>
            <p className="break-words text-base leading-7 text-white/85">
              Go monthly for consistent tokens, or start with a{" "}
              <span className="font-semibold text-amber-200">Top‑Up Pack</span>{" "}
              to try Burnt Beats with no subscription.
            </p>
            <BillingRules />
            <ul className="grid gap-2 text-sm text-white/78 sm:grid-cols-2">
              <li className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                Top‑Up Pack: one-time credits, no subscription.
              </li>
              <li className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                Monthly plans: more tokens and faster workflow.
              </li>
            </ul>
            {subscription.status === "inactive" &&
              usageContext?.hasCompletedFirstExport && (
                <p className="text-sm text-amber-100/95">
                  You&apos;ve already finished a stem — upgrading now keeps your
                  workflow fast and uninterrupted.
                </p>
              )}
            {subscription.plan === "basic" &&
              (usageContext?.splitsThisSession ?? 0) >= 3 && (
                <p className="text-sm text-amber-100/90">
                  You&apos;re using Burnt Beats like our Premium users —
                  upgrading usually costs less than repeated Top‑Ups.
                </p>
              )}
          </div>
          <div className="mt-2 flex flex-col items-start gap-3 lg:items-end">
            {subscription.status === "active" && subscription.plan && (
              <p className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-[10px] font-medium text-emerald-200/90 sm:text-[11px]">
                Current plan:{" "}
                <span className="uppercase">{subscription.plan}</span>
              </p>
            )}
            {showPrimaryCheckout && (
              <button
                type="button"
                onClick={() => handleSelectPlan("basic")}
                disabled={
                  subscription.status === "loading" ||
                  checkoutLoadingPlan !== null
                }
                aria-label="Pay now with Stripe and start Basic plan"
                aria-live="polite"
                className="fire-button tap-feedback min-h-[44px] w-full px-5 py-2 text-sm sm:w-auto sm:min-w-[240px]"
              >
                {checkoutLoadingPlan === "basic" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting to checkout...
                  </span>
                ) : (
                  "Start Basic · Secure Stripe checkout"
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <motion.section
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
        {...(reduceMotion
          ? {
              initial: false,
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0 },
            }
          : {
              initial: { opacity: 0, y: 12 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.4 },
            })}
      >
        {PLANS.map((plan) => {
          const isActive =
            subscription.status === "active" && subscription.plan === plan.id;
          const isPremium = plan.id === "premium";
          const accentRing = isPremium
            ? "border-amber-400/70 shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_0_48px_rgba(251,191,36,0.35)]"
            : plan.emphasis || plan.highlight === "primary"
              ? "border-amber-400/40 shadow-[0_0_28px_rgba(251,191,36,0.2)]"
              : "border-white/10";

          return (
            <div
              key={plan.id}
              className={`glass-panel flex h-full min-w-0 flex-col justify-between rounded-2xl border bg-black/40 p-4 sm:p-5 ${accentRing} ${isPremium ? "scale-[1.03] origin-center" : ""}`}
            >
              <div className="space-y-2.5">
                {isPremium && (
                  <div className="-mx-1 -mt-1 mb-2 flex justify-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.3)]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <h2 className="break-words text-base font-semibold text-white/95">
                    {plan.name}
                  </h2>
                  {plan.badge && !isPremium && (
                    <span className="max-w-[60%] break-words rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-100/85 sm:text-[10px]">
                      {plan.badge}
                    </span>
                  )}
                </div>
                <p className="break-words text-sm font-medium text-amber-200/95">
                  {plan.priceLabel}
                </p>
                <p className="break-words text-sm leading-5 text-white/78">
                  {plan.description}
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-white/80">
                  {plan.details.map((d) => (
                    <li key={d} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-300" />
                      <span className="break-words">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectPlan(plan.id)}
                  aria-label={
                    isActive
                      ? `${plan.name} is your current plan`
                      : `Choose ${plan.name} plan`
                  }
                  className={
                    plan.highlight === "primary" || plan.emphasis
                      ? "fire-button tap-feedback min-h-[40px] w-full py-2 text-xs"
                      : "ghost-button tap-feedback min-h-[40px] w-full py-2 text-xs"
                  }
                  disabled={
                    subscription.status === "loading" ||
                    checkoutLoadingPlan !== null ||
                    isActive
                  }
                >
                  {checkoutLoadingPlan === plan.id ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Redirecting...
                    </span>
                  ) : isActive ? (
                    "Current plan"
                  ) : (
                    plan.cta
                  )}
                </button>
                {plan.id === "topup" && (
                  <p className="text-xs leading-5 text-amber-100/90">
                    Pay only when you need more tokens. No recurring charges,
                    ever.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </motion.section>

      {/* Stripe hosted pricing table */}
      <motion.section
        className="glass-panel rounded-2xl border border-white/10 p-4 sm:p-6"
        {...(reduceMotion
          ? {
              initial: false,
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0 },
            }
          : {
              initial: { opacity: 0, y: 12 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.4, delay: 0.1 },
            })}
      >
        <div className="mb-4 text-center">
          <p className="eyebrow mb-1 text-xs text-amber-200/90">
            Detailed Comparison
          </p>
          <p className="mb-4 text-sm text-white/80">
            Compare every feature and limit across our plans below.
          </p>
          <div className="mx-auto flex w-fit rounded-lg border border-white/10 bg-black/40 p-1">
            <button
              onClick={() => setPricingTab("subscriptions")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                pricingTab === "subscriptions"
                  ? "bg-amber-400/20 text-amber-200"
                  : "text-white/60 hover:bg-white/5 hover:text-white/90"
              }`}
            >
              Subscriptions
            </button>
            <button
              onClick={() => setPricingTab("packs")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                pricingTab === "packs"
                  ? "bg-amber-400/20 text-amber-200"
                  : "text-white/60 hover:bg-white/5 hover:text-white/90"
              }`}
            >
              Credit Packs
            </button>
          </div>
        </div>
        <PricingTablePreview
          pricingType={pricingTab}
          ctaButtonRenderer={renderCheckoutCTA}
        />
      </motion.section>

      {/* FAQ / objections reducer */}
      <motion.section
        className="grid gap-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white/80 sm:grid-cols-2 sm:p-6"
        {...(reduceMotion
          ? {
              initial: false,
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0 },
            }
          : {
              initial: { opacity: 0, y: 12 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.4, delay: 0.2 },
            })}
      >
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80 sm:tracking-[0.16em]">
            What happens if I run out of tokens?
          </p>
          <p>
            You can either top up with a one‑time credit pack or upgrade to a
            higher plan. We&apos;ll never auto‑charge you for overages.
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80 sm:tracking-[0.16em]">
            Can I switch plans later?
          </p>
          <p>
            Yes. Upgrade or downgrade at any time — changes take effect on your
            next billing cycle and you keep access to any remaining tokens.
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80 sm:tracking-[0.16em]">
            Is there a long‑term contract?
          </p>
          <p>
            No contracts. All plans are month‑to‑month, and you can cancel
            whenever you like from your billing portal.
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80 sm:tracking-[0.16em]">
            Do you offer refunds?
          </p>
          <p>
            If anything goes wrong with billing, reach out and we&apos;ll make
            it right. If you&apos;re unsure, start small with a Top‑Up Pack
            first.
          </p>
        </div>
      </motion.section>

      <p className="border-t border-white/10 pt-8 text-center">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-amber-200/95 transition hover:border-amber-400/35 hover:bg-amber-500/10 hover:text-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/50"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to editor
        </button>
      </p>
    </div>
  );
}
