import { type ReactNode } from "react";

export type PricingTableType = "subscriptions" | "packs";

interface PlanConfig {
  name: string;
  priceLabel: string;
  badge?: string;
  description: string;
  details: string[];
  highlight?: boolean;
}

const SUBSCRIPTION_PLANS: PlanConfig[] = [
  {
    name: "Basic",
    priceLabel: "$9/month",
    badge: "Starter",
    description: "For artists who want a steady trickle of sessions every month.",
    details: [
      "120 tokens/month (1 token = 1 minute).",
      "2 high-quality stems (Vocal + Instruments).",
      "Perfect for karaoke-style splits.",
      "Priority processing over free traffic.",
      "Mixer and editor functions included.",
    ],
  },
  {
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
  },
  {
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
  },
];

const PACK_PLANS: PlanConfig[] = [
  {
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
  },
  {
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
  },
];

function PlanCard({ plan }: { plan: PlanConfig }) {
  return (
    <article
      className={`rounded-3xl border border-white/10 bg-black/50 p-6 shadow-[0_0_30px_rgba(0,0,0,0.12)] transition hover:border-white/20 hover:bg-white/5 ${
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
      <p className="mt-5 text-3xl font-semibold text-amber-200">{plan.priceLabel}</p>
      <ul className="mt-5 space-y-3 text-sm text-white/70">
        {plan.details.map((detail) => (
          <li key={detail} className="flex gap-3">
            <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span>{detail}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function PricingTablePreview({ pricingType }: { pricingType: PricingTableType }) {
  const plans = pricingType === "subscriptions" ? SUBSCRIPTION_PLANS : PACK_PLANS;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.name} plan={plan} />
        ))}
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/75">
        <p className="font-medium text-white">Stripe pricing is powered by backend price IDs.</p>
        <p className="mt-2">
          All plan prices are managed through Stripe price IDs and our secure checkout flow. Sign in or create an account to select a plan and start your purchase.
        </p>
      </div>
    </div>
  );
}
