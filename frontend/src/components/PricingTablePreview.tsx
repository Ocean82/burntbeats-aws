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
      className={`flex flex-col rounded-3xl border border-white/10 bg-black/50 p-6 shadow-[0_0_30px_rgba(0,0,0,0.12)] transition hover:border-white/20 hover:bg-white/5 ${
        plan.highlight ? "ring-1 ring-amber-400/20" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xl font-semibold text-white">{plan.name}</p>
          <p className="mt-2 text-sm text-white/70">{plan.description}</p>
        </div>
        {plan.badge ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/70">
            {plan.badge}
          </span>
        ) : null}
      </div>
      <p className="mt-5 text-3xl font-semibold text-amber-200">
        {plan.priceLabel}
      </p>
      <ul className="mt-5 flex-1 space-y-3 text-sm text-white/70">
        {plan.details.map((detail) => (
          <li key={detail} className="flex gap-3">
            <span className="mt-1 inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-400/80" />
            <span>{detail}</span>
          </li>
        ))}
      </ul>
      {ctaButton ? (
        <div className="mt-6">{ctaButton}</div>
      ) : onSelect ? (
        <button
          type="button"
          onClick={handleClick}
          className="mt-6 w-full rounded-lg border border-amber-400/30 bg-amber-500/20 px-4 py-3 font-medium text-amber-200 transition hover:border-amber-400/50 hover:bg-amber-500/30"
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
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onSelect={onSelectPlan}
            ctaButton={ctaButtonRenderer?.(plan)}
          />
        ))}
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/75">
        <p className="font-medium text-white">
          Secure checkout powered by Stripe.
        </p>
        <p className="mt-2">
          All plan prices are secured and managed through Stripe. Create an
          account or sign in to select a plan and complete your purchase.
        </p>
      </div>
    </div>
  );
}
