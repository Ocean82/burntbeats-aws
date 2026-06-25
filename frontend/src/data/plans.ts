/**
 * Single source of truth for all plan definitions.
 * Every pricing surface (PaywallBanner, PricingPage, LandingPage, PricingTablePreview)
 * pulls from these arrays so pricing copy stays consistent.
 *
 * Token grants mirror Stripe Price metadata (tokens_per_month / tokens_per_topup).
 */
import type { Plan } from "../hooks/useSubscription";

export interface PlanConfig {
  id: Plan;
  name: string;
  priceLabel: string;
  badge?: string;
  description: string;
  details: string[];
  highlight?: boolean;
  cta: string;
}

/** One-time pack token grants — keep in sync with Stripe Price metadata. */
export const PACK_TOKEN_GRANTS = {
  single: 4,
  topup: 60,
} as const;

export type BillingInterval = "month" | "year";

/** Annual effective monthly framing — matches Stripe annual prices in plan. */
export const ANNUAL_PLAN_PRICING: Record<
  "basic" | "premium" | "studio",
  { annualTotal: string; effectiveMonthly: string }
> = {
  basic: { annualTotal: "$86/yr", effectiveMonthly: "~$7.17/mo" },
  premium: { annualTotal: "$144/yr", effectiveMonthly: "$12/mo" },
  studio: { annualTotal: "$240/yr", effectiveMonthly: "$20/mo" },
};

export function planPriceLabel(
  planId: "basic" | "premium" | "studio",
  interval: BillingInterval,
  monthlyLabel: string,
): string {
  if (interval === "year") {
    const annual = ANNUAL_PLAN_PRICING[planId];
    return `${annual.annualTotal} (${annual.effectiveMonthly})`;
  }
  return monthlyLabel;
}

/** Hero subscription cards — Premium + Basic only. */
export const HERO_SUBSCRIPTION_PLANS: PlanConfig[] = [
  {
    id: "premium",
    name: "Premium",
    priceLabel: "$15/month",
    badge: "Most popular",
    description:
      "Full browser workstation: split, mix, MIDI, vocal cleanup, and export in one session.",
    highlight: true,
    details: [
      "300 tokens/month (1 token = 1 minute of audio).",
      "4-stem split, quality modes, and batch queue.",
      "Waveform mixer, multi-stem editor, and client-side export.",
      "Audio-to-MIDI, vocal cleanup, and beat maker (unlimited patterns).",
      "Unused tokens roll over — they add to your balance each month.",
      "Best when Burnt Beats is part of your weekly workflow.",
    ],
    cta: "Start Premium",
  },
  {
    id: "basic",
    name: "Basic",
    priceLabel: "$9/month",
    badge: "Starter",
    description:
      "Speed-mode 2-stem splits plus the in-browser mixer and export when you need a lighter monthly plan.",
    details: [
      "120 tokens/month (1 token = 1 minute of audio).",
      "2-stem split in speed mode (vocals + instrumental).",
      "Mixer, export, MIDI tools, and vocal cleanup with your token balance.",
      "Beat maker with up to 10 saved patterns.",
      "Unused tokens roll over month to month.",
      "Upgrade to Premium for 4-stem, quality modes, and batch queue.",
    ],
    cta: "Start Basic",
  },
];

export const STUDIO_PLAN: PlanConfig = {
  id: "studio",
  name: "Studio",
  priceLabel: "$25/month",
  badge: "Power users",
  description:
    "Premium workstation features with the highest monthly token allowance and priority processing.",
  details: [
    "800 tokens/month (1 token = 1 minute of audio).",
    "Everything in Premium: 4-stem, quality, batch, mixer, MIDI, vocal cleanup.",
    "Priority queue for heavier session volume.",
    "Unused tokens roll over month to month.",
    "Early access to beta features as they ship.",
    "Built for studios and frequent multi-track revisions.",
  ],
  cta: "Start Studio",
};

export const SUBSCRIPTION_PLANS: PlanConfig[] = [
  ...HERO_SUBSCRIPTION_PLANS,
  STUDIO_PLAN,
];

export const PACK_PLANS: PlanConfig[] = [
  {
    id: "single",
    name: "Single Song Pack",
    priceLabel: "$0.99 one-time",
    badge: "Best for trying",
    description: "Try the full split-to-export workflow on one track with no subscription.",
    details: [
      `${PACK_TOKEN_GRANTS.single} tokens (~${PACK_TOKEN_GRANTS.single} minutes of audio).`,
      "Speed-mode 2-stem split plus in-browser mixer and export.",
      "No recurring charges — buy again any time.",
      "Upgrade to Premium later for 4-stem and quality modes.",
    ],
    cta: "Buy Single Pack",
  },
  {
    id: "topup",
    name: "Top-Up Pack",
    priceLabel: "$5 one-time",
    badge: "Most flexible",
    highlight: true,
    description: "One-time credits for occasional sessions — no monthly plan required.",
    details: [
      `${PACK_TOKEN_GRANTS.topup} tokens (~${PACK_TOKEN_GRANTS.topup} minutes of audio).`,
      "Includes 4-stem and quality modes while you have balance.",
      "Same stem engine and workstation tools as monthly plans.",
      "Tokens stay on your balance until you use them.",
      "Great for guest edits, one-off prep, and topping up mid-project.",
    ],
    cta: "Buy Top-Up Pack",
  },
];

/** All plans combined (packs first, then subscriptions). */
export const ALL_PLANS: PlanConfig[] = [...PACK_PLANS, ...SUBSCRIPTION_PLANS];

export type PricingTableType = "subscriptions" | "packs";

/** Get plans for a given pricing tab. */
export function getPlansForType(
  type: PricingTableType,
  opts?: { heroOnly?: boolean; interval?: BillingInterval },
): PlanConfig[] {
  if (type === "packs") return PACK_PLANS;
  const base = opts?.heroOnly ? HERO_SUBSCRIPTION_PLANS : SUBSCRIPTION_PLANS;
  const interval = opts?.interval ?? "month";
  if (interval === "month") return base;
  return base.map((plan) => {
    if (plan.id !== "basic" && plan.id !== "premium" && plan.id !== "studio") {
      return plan;
    }
    return {
      ...plan,
      priceLabel: planPriceLabel(plan.id, interval, plan.priceLabel),
    };
  });
}

/** Short value prop for paywalls and teasers. */
export const WORKSTATION_VALUE_LINE =
  "Split, mix, export, MIDI, vocal cleanup, and beat tools — all in your browser.";
