import { ArrowRight } from "lucide-react";
import { type ReactNode } from "react";
import type { Plan } from "../hooks/useSubscription";
import { getPlansForType, type PlanConfig, type PricingTableType } from "../data/plans";
import { cn } from "../utils/cn";

// Re-export for consumers that imported from here previously
export type { PlanConfig, PricingTableType };

interface PlanCardProps {
  plan: PlanConfig;
  onSelect?: (planId: Plan) => void;
  ctaButton?: ReactNode;
  isCurrentPlan?: boolean;
}

function PlanCard({ plan, onSelect, ctaButton, isCurrentPlan = false }: PlanCardProps) {
  const interactive = Boolean(onSelect) && !isCurrentPlan;
  const handleSelect = () => onSelect?.(plan.id);

  return (
    <article
      data-testid={`pricing-plan-${plan.id}`}
      className={cn(
        "group flex flex-col rounded-3xl border border-border bg-secondary p-lg shadow-elevation-md transition",
        interactive &&
          "hover:-translate-y-0.5 hover:border-primary-400/45 hover:bg-primary-500/8 hover:shadow-elevation-lg",
        isCurrentPlan &&
          "border-success-400/45 bg-success-500/10 ring-2 ring-success-400/20",
        plan.highlight && "ring-1 ring-primary-400/20",
      )}
    >
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold text-foreground">{plan.name}</p>
          <p className="mt-xs text-sm text-secondary-foreground">{plan.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-xs">
          {isCurrentPlan ? (
            <span className="rounded-full border border-success-400/35 bg-success-500/15 px-sm py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-success-200">
              Current plan
            </span>
          ) : null}
          {plan.badge ? (
            <span className="rounded-full border border-border bg-muted px-sm py-1 text-[11px] uppercase tracking-[0.22em] text-secondary-foreground">
              {plan.badge}
            </span>
          ) : null}
        </div>
      </div>
      {interactive ? (
        <button
          type="button"
          data-testid={`pricing-price-${plan.id}`}
          onClick={handleSelect}
          className="mt-lg inline-flex w-fit items-center gap-xs rounded-full border border-primary-400/25 bg-primary-500/10 px-md py-xs text-left text-2xl font-semibold text-primary-100 transition group-hover:border-primary-400/45 group-hover:bg-primary-500/18 group-hover:text-primary-50 hover:border-primary-300/60 hover:bg-primary-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-3xl"
          aria-label={`Choose ${plan.name} for ${plan.priceLabel}`}
        >
          {plan.priceLabel}
          <ArrowRight className="h-4 w-4 shrink-0 opacity-75 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
        </button>
      ) : (
        <p
          data-testid={`pricing-price-${plan.id}`}
          className={cn(
            "mt-lg text-3xl font-semibold text-primary-200",
            isCurrentPlan && "text-success-100",
          )}
        >
          {plan.priceLabel}
        </p>
      )}
      <ul className="mt-lg flex-1 space-y-sm text-sm text-secondary-foreground">
        {plan.details.map((detail) => (
          <li key={detail} className="flex gap-sm">
            <span className="mt-1 inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary-400/80" />
            <span>{detail}</span>
          </li>
        ))}
      </ul>
      {ctaButton ? (
        <div className="mt-lg">
          {ctaButton}
        </div>
      ) : onSelect ? (
        <button
          type="button"
          onClick={handleSelect}
          className="mt-lg w-full rounded-lg border border-primary-400/30 bg-primary-500/20 px-md py-sm font-medium text-primary-200 transition hover:border-primary-400/50 hover:bg-primary-500/30"
        >
          {plan.cta}
        </button>
      ) : null}
    </article>
  );
}

export interface PricingTablePreviewProps {
  pricingType: PricingTableType;
  onSelectPlan?: (planId: Plan) => void;
  ctaButtonRenderer?: (plan: PlanConfig) => ReactNode;
  currentPlan?: Plan | null;
}

export function PricingTablePreview({
  pricingType,
  onSelectPlan,
  ctaButtonRenderer,
  currentPlan = null,
}: PricingTablePreviewProps) {
  const plans = getPlansForType(pricingType);

  return (
    <div className="space-y-lg" data-testid="pricing-table-preview">
      <div
        id="pricing-tabpanel-plans"
        role="tabpanel"
        className="grid gap-md sm:grid-cols-2 lg:grid-cols-3"
      >
        {plans.map((plan) => (
          <div key={plan.id} className="min-w-0">
            <PlanCard
              plan={plan}
              onSelect={onSelectPlan}
              ctaButton={ctaButtonRenderer?.(plan)}
              isCurrentPlan={currentPlan === plan.id}
            />
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-border bg-muted p-lg text-sm text-secondary-foreground">
        <p className="font-medium text-foreground">
          Secure checkout powered by Stripe.
        </p>
        <p className="mt-xs">
          All plan prices are secured and managed through Stripe. Create an
          account or sign in to select a plan and complete your purchase.
        </p>
      </div>
    </div>
  );
}
