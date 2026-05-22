import { type ReactNode } from "react";
import type { Plan } from "../hooks/useSubscription";
import { getPlansForType, type PlanConfig, type PricingTableType } from "../data/plans";

// Re-export for consumers that imported from here previously
export type { PlanConfig, PricingTableType };

interface PlanCardProps {
  plan: PlanConfig;
  onSelect?: (planId: Plan) => void;
  ctaButton?: ReactNode;
}

function PlanCard({ plan, onSelect, ctaButton }: PlanCardProps) {
  const handleClick = () => onSelect?.(plan.id);

  return (
    <article
      className={`flex flex-col rounded-3xl border border-border bg-secondary p-lg shadow-[0_0_30px_rgba(0,0,0,0.12)] transition hover:border-border hover:bg-muted ${
        plan.highlight ? "ring-1 ring-primary-400/20" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="text-xl font-semibold text-foreground">{plan.name}</p>
          <p className="mt-xs text-sm text-secondary-foreground">{plan.description}</p>
        </div>
        {plan.badge ? (
          <span className="rounded-full border border-border bg-muted px-sm py-1 text-[11px] uppercase tracking-[0.22em] text-secondary-foreground">
            {plan.badge}
          </span>
        ) : null}
      </div>
      <p className="mt-lg text-3xl font-semibold text-primary-200">
        {plan.priceLabel}
      </p>
      <ul className="mt-lg flex-1 space-y-sm text-sm text-secondary-foreground">
        {plan.details.map((detail) => (
          <li key={detail} className="flex gap-sm">
            <span className="mt-1 inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary-400/80" />
            <span>{detail}</span>
          </li>
        ))}
      </ul>
      {ctaButton ? (
        <div className="mt-lg">{ctaButton}</div>
      ) : onSelect ? (
        <button
          type="button"
          onClick={handleClick}
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
}

export function PricingTablePreview({
  pricingType,
  onSelectPlan,
  ctaButtonRenderer,
}: PricingTablePreviewProps) {
  const plans = getPlansForType(pricingType);

  return (
    <div className="space-y-lg">
      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onSelect={onSelectPlan}
            ctaButton={ctaButtonRenderer?.(plan)}
          />
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
