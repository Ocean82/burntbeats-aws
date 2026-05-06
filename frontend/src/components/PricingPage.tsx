import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import type { Plan, UseSubscriptionResult } from "../hooks/useSubscription";
import type { PlanConfig, PricingTableType } from "../data/plans";
import { PricingTablePreview } from "./PricingTablePreview";
import { PricingTabToggle } from "./PricingTabToggle";
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

export function PricingPage({
  subscription,
  onClose,
  usageContext,
}: PricingPageProps) {
  const reduceMotion = useReducedMotion();
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<Plan | null>(
    null,
  );
  const [pricingTab, setPricingTab] = useState<PricingTableType>("subscriptions");

  const handleSelectPlan = (plan: Plan) => {
    trackEvent("pricing_plan_selected", {
      source: "pricing_page",
      plan,
    });
    setCheckoutLoadingPlan(plan);
    void subscription
      .startCheckout(plan, {
        source: "pricing_page",
        intent: "pricing_page_cta",
      })
      .finally(() => {
        setCheckoutLoadingPlan(null);
      });
  };

  const showPrimaryCheckout = subscription.status !== "active";

  const renderCheckoutCTA = (plan: PlanConfig) => (
    <button
      type="button"
      onClick={() => handleSelectPlan(plan.id)}
      disabled={
        subscription.status === "loading" || checkoutLoadingPlan !== null
      }
      className="w-full rounded-lg border border-amber-400/30 bg-amber-500/20 px-4 py-3 font-medium text-amber-200 transition hover:border-amber-400/50 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
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
              <span className="font-semibold text-amber-200">Top-Up Pack</span>{" "}
              to try Burnt Beats with no subscription.
            </p>
            <BillingRules />
            <ul className="grid gap-2 text-sm text-white/78 sm:grid-cols-2">
              <li className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                Top-Up Pack: one-time credits, no subscription.
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
                  upgrading usually costs less than repeated Top-Ups.
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

      {/* Plan cards — single rendering via PricingTablePreview */}
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
              transition: { duration: 0.4 },
            })}
      >
        <div className="mb-4 text-center">
          <p className="eyebrow mb-1 text-xs text-amber-200/90">
            Plans & Packs
          </p>
          <p className="mb-4 text-sm text-white/80">
            Compare every feature and limit across our plans below.
          </p>
          <div className="mx-auto flex justify-center">
            <PricingTabToggle activeTab={pricingTab} onTabChange={setPricingTab} />
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
              transition: { duration: 0.4, delay: 0.1 },
            })}
      >
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80 sm:tracking-[0.16em]">
            What happens if I run out of tokens?
          </p>
          <p>
            You can either top up with a one-time credit pack or upgrade to a
            higher plan. We&apos;ll never auto-charge you for overages.
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
            Is there a long-term contract?
          </p>
          <p>
            No contracts. All plans are month-to-month, and you can cancel
            whenever you like from your billing portal.
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80 sm:tracking-[0.16em]">
            Do you offer refunds?
          </p>
          <p>
            If anything goes wrong with billing, reach out and we&apos;ll make
            it right. If you&apos;re unsure, start small with a Top-Up Pack
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
