/**
 * Single source of truth for all plan definitions.
 * Every pricing surface (PaywallBanner, PricingPage, LandingPage, PricingTablePreview)
 * pulls from these arrays so pricing copy stays consistent.
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

export const SUBSCRIPTION_PLANS: PlanConfig[] = [
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

export const PACK_PLANS: PlanConfig[] = [
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

/** All plans combined (packs first, then subscriptions). */
export const ALL_PLANS: PlanConfig[] = [...PACK_PLANS, ...SUBSCRIPTION_PLANS];

export type PricingTableType = "subscriptions" | "packs";

/** Get plans for a given pricing tab. */
export function getPlansForType(type: PricingTableType): PlanConfig[] {
  return type === "subscriptions" ? SUBSCRIPTION_PLANS : PACK_PLANS;
}
