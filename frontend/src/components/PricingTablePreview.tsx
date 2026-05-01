import { type ReactNode } from "react";

export type PricingTableType = "subscriptions" | "packs";

export interface PlanConfig {
  id: string;
  name: string;
  priceLabel: string;
  badge?: string;
  description: string;
  details: string[];
  highlight?: boolean;
  cta: string;
}

const SUBSCRIPTION_PLANS: PlanConfig[] = [
  {
    id: "basic",
    name: "Basic",
    priceLabel: "$9/month",
    badge: "Starter",
    description:
      "For artists who want a steady trickle of sessions every month.",
    details: [
      "120 tokens/month (1 token = 1 minute).",
      "2 high-quality stems (Vocal + Instruments).",
      "Perfect for karaoke-style splits.",
      "Priority processing over free traffic.",
      "Mixer and editor functions included.",
    ],
    cta: "Start Basic",
  },
  {
    id: "premium",
    name: "Premium",
    priceLabel: "$15/month",
    badge: "Most popular",
    description: "For active producers bouncing between projects all week.",
    highlight: true,
    details: [
      "300 tokens/month (1 token = 1 minute).",
      "High-quality multi-stem options (4 stems).",
      "Priority processing and batch tools unlocked.",
      "Full mixer, editor, and pro mixing tools.",
      "Great for collaborators and repeat sessions.",
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
      "Highest quality stem options and full multi-stem support.",
      "Priority queue placement and faster results.",
      "Bonus tokens awarded regularly.",
      "Access to beta feature previews.",
    ],
    cta: "Start Studio",
  },
];

const PACK_PLANS: PlanConfig[] = [
  {
    id: "single",
    name: "Single Song Pack",
    priceLabel: "$0.99 one-time",
    badge: "Best for trying",
    description: "Enough for one basic song split. No subscription required.",
    details: [
      "4 tokens (enough for ~4 minutes of audio).",
      "Perfect for trying Burnt Beats on a single track.",
      "No recurring charges, ever.",
      "Standard quality stems.",
      "Unlimited purchases.",
    ],
    cta: "Buy Single Pack",
  },
  {
    id: "topup",
    name: "Top-Up Pack",
    priceLabel: "$5 one-time",
    badge: "Most flexible",
    highlight: true,
    description: "Perfect if you only need stems occasionally.",
    details: [
      "One-time purchase of tokens — no recurring charge.",
      "Use the same high-quality stem engine as monthly plans.",
      "Great for guests and collaborators.",
      "Top up again any time you run low.",
      "No plan required for karaoke splits.",
    ],
    cta: "Buy Top-Up Pack",
  },
];

interface PlanCardProps {
  plan: PlanConfig;
  onSelect?: (planId: string) => void;
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
  onSelectPlan?: (planId: string) => void;
  ctaButtonRenderer?: (plan: PlanConfig) => ReactNode;
}

export function PricingTablePreview({
  pricingType,
  onSelectPlan,
  ctaButtonRenderer,
}: PricingTablePreviewProps) {
  const plans =
    pricingType === "subscriptions" ? SUBSCRIPTION_PLANS : PACK_PLANS;

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
