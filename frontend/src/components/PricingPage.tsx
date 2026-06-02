import { motion, useReducedMotion } from "framer-motion";
import { viewSwitchMotion } from "../motion/presets";
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

export interface PricingPageProps {
  subscription: UseSubscriptionResult;
  onClose: () => void;
  usageContext?: UsageContext;
  /** Initial tab to show (subscriptions or packs) */
  initialTab?: PricingTableType;
}

export function PricingPage({
  subscription,
  onClose,
  usageContext,
  initialTab,
}: PricingPageProps) {
  const reduceMotion = useReducedMotion();
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<Plan | null>(
    null,
  );
  const [pricingTab, setPricingTab] = useState<PricingTableType>(initialTab ?? "subscriptions");
  const isCurrentPlan = (plan: Plan) =>
    subscription.status === "active" && subscription.plan === plan;

  const handleSelectPlan = (plan: Plan) => {
    if (isCurrentPlan(plan)) return;
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
      data-testid={`pricing-cta-${plan.id}`}
      onClick={() => handleSelectPlan(plan.id)}
      disabled={
        subscription.status === "loading" ||
        checkoutLoadingPlan !== null ||
        isCurrentPlan(plan.id)
      }
      className={
        isCurrentPlan(plan.id)
          ? "min-h-[44px] w-full rounded-lg border border-success-400/35 bg-success-500/15 px-md py-sm font-medium text-success-100 disabled:cursor-default tap-feedback"
          : "min-h-[44px] w-full rounded-lg border border-primary-400/30 bg-primary-500/20 px-md py-sm font-medium text-primary-200 transition hover:border-primary-400/50 hover:bg-primary-500/30 disabled:cursor-not-allowed disabled:opacity-60 tap-feedback"
      }
    >
      {checkoutLoadingPlan === plan.id ? (
        <span className="inline-flex items-center justify-center gap-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
          Redirecting...
        </span>
      ) : isCurrentPlan(plan.id) ? (
        "Current plan"
      ) : (
        plan.cta
      )}
    </button>
  );

  return (
    <motion.div
      data-testid="pricing-page"
      className="relative mx-auto flex w-full max-w-[1200px] flex-col gap-2xl overflow-x-clip px-sm py-md sm:px-lg lg:px-xl"
      {...viewSwitchMotion(Boolean(reduceMotion))}
    >
      {/* Wayfinding: in-app pricing view — always offer an explicit path back without browser Back */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-col gap-sm rounded-2xl border border-border bg-muted px-md py-sm sm:flex-row sm:items-center sm:justify-between sm:px-lg"
      >
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secondary-foreground">
          <li className="flex min-w-0 items-center gap-xs">
            <button
              type="button"
              data-testid="pricing-back-to-editor"
              onClick={onClose}
              className="group inline-flex min-h-[44px] min-w-0 items-center gap-xs rounded-xl border border-border bg-muted px-sm py-xs text-left text-primary-200/95 transition hover:border-primary-400/35 hover:bg-primary-500/10 hover:text-primary-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400/50 tap-feedback"
            >
              <ArrowLeft
                className="h-4 w-4 shrink-0 text-primary-300/90 transition group-hover:-translate-x-0.5"
                aria-hidden
              />
              <span className="font-medium">Back to editor</span>
            </button>
          </li>
          <li aria-hidden="true" className="text-muted-foreground">
            /
          </li>
          <li className="min-w-0 truncate text-muted-foreground" aria-current="page">
            Pricing &amp; plans
          </li>
        </ol>
        <p className="text-[11px] leading-snug text-muted-foreground sm:max-w-sm sm:text-right">
          Same as <span className="text-muted-foreground">Back to editor</span> in the
          header — no need for the browser Back button.
        </p>
      </nav>

      {/* Header / hero */}
      <section className="glass-panel mirror-sheen rounded-[2rem] px-md py-lg sm:px-lg sm:py-xl lg:px-10">
        <div className="flex flex-col gap-lg lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-sm">
            <p className="eyebrow text-primary-200/90">Pricing & plans</p>
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Pick your plan and start splitting in minutes.
            </h1>
            <p className="break-words text-base leading-7 text-secondary-foreground">
              Go monthly for consistent tokens, or start with a{" "}
              <span className="font-semibold text-primary-200">Top-Up Pack</span>{" "}
              to try Burnt Beats with no subscription.
            </p>
            <BillingRules />
            <ul className="grid gap-xs text-sm text-secondary-foreground sm:grid-cols-2">
              <li className="min-w-0 rounded-lg border border-border bg-muted px-sm py-xs">
                Top-Up Pack: one-time credits, no subscription.
              </li>
              <li className="min-w-0 rounded-lg border border-border bg-muted px-sm py-xs">
                Monthly plans: more tokens and faster workflow.
              </li>
            </ul>
            {subscription.status === "inactive" &&
              usageContext?.hasCompletedFirstExport && (
                <p className="text-sm text-primary-100/95">
                  You&apos;ve already finished a stem — upgrading now keeps your
                  workflow fast and uninterrupted.
                </p>
              )}
            {subscription.plan === "basic" &&
              (usageContext?.splitsThisSession ?? 0) >= 3 && (
                <p className="text-sm text-primary-100/90">
                  You&apos;re using Burnt Beats like our Premium users —
                  upgrading usually costs less than repeated Top-Ups.
                </p>
              )}
          </div>
          <div className="mt-xs flex flex-col items-start gap-sm lg:items-end">
            {subscription.status === "active" && subscription.plan && (
              <p className="rounded-full border border-success-400/40 bg-success-500/15 px-sm py-1 text-[10px] font-medium text-success-200/90 sm:text-[11px]">
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
                className="fire-button tap-feedback min-h-[44px] w-full px-lg py-xs text-sm sm:w-auto sm:min-w-[240px]"
              >
                {checkoutLoadingPlan === "basic" ? (
                  <span className="inline-flex items-center gap-xs">
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
      <section className="glass-panel rounded-2xl border border-border p-md sm:p-lg">
        <div className="mb-md text-center">
          <p className="eyebrow mb-1 text-xs text-primary-200/90">
            Plans & Packs
          </p>
          <p className="mb-md text-sm text-secondary-foreground">
            Compare every feature and limit across our plans below.
          </p>
          <div className="mx-auto flex justify-center">
            <PricingTabToggle activeTab={pricingTab} onTabChange={setPricingTab} />
          </div>
        </div>
        <PricingTablePreview
          pricingType={pricingTab}
          onSelectPlan={handleSelectPlan}
          ctaButtonRenderer={renderCheckoutCTA}
          currentPlan={
            subscription.status === "active" && subscription.plan !== "unknown"
              ? subscription.plan
              : null
          }
        />
      </section>

      {/* FAQ / objections reducer */}
      <section className="grid gap-md rounded-2xl border border-border bg-secondary p-md text-sm text-secondary-foreground sm:grid-cols-2 sm:p-lg">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-secondary-foreground sm:tracking-[0.16em]">
            What happens if I run out of tokens?
          </p>
          <p className="text-pretty">
            You can either top up with a one-time credit pack or upgrade to a
            higher plan. We&apos;ll never auto-charge you for overages.
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-secondary-foreground sm:tracking-[0.16em]">
            Can I switch plans later?
          </p>
          <p className="text-pretty">
            Yes. Upgrade or downgrade at any time — changes take effect on your
            next billing cycle and you keep access to any remaining tokens.
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-secondary-foreground sm:tracking-[0.16em]">
            Is there a long-term contract?
          </p>
          <p className="text-pretty">
            No contracts. All plans are month-to-month, and you can cancel
            whenever you like from your billing portal.
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-secondary-foreground sm:tracking-[0.16em]">
            Do you offer refunds?
          </p>
          <p className="text-pretty">
            If anything goes wrong with billing, reach out and we&apos;ll make
            it right. If you&apos;re unsure, start small with a Top-Up Pack
            first.
          </p>
        </div>
      </section>

      <p className="border-t border-border pt-8 text-center">
        <button
          type="button"
          data-testid="pricing-back-to-editor-footer"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center justify-center gap-xs rounded-xl border border-border bg-muted px-md py-xs text-sm font-medium text-primary-200/95 transition hover:border-primary-400/35 hover:bg-primary-500/10 hover:text-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400/50 tap-feedback"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to editor
        </button>
      </p>
    </motion.div>
  );
}
