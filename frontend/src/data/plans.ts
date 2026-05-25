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
      "For producers who want the workstation ready whenever a track needs a first pass.",
    details: [
      "120 tokens/month (1 token = 1 minute).",
      "2-stem workflow for vocals and instrumentals.",
      "Open the mixer and export without leaving the browser.",
      "Great for acapellas, edits, and first-pass prep.",
      "Priority processing over free traffic.",
      "Built for repeat use without committing to a larger tier.",
    ],
    cta: "Start Basic",
  },
  {
    id: "premium",
    name: "Premium",
    priceLabel: "$15/month",
    badge: "Most popular",
    description: "For DJs and producers building edits, remixes, and repeat sessions every week.",
    highlight: true,
    details: [
      "300 tokens/month (1 token = 1 minute).",
      "4-stem workflow for deeper control over the split.",
      "Full-quality options and batch tools unlocked.",
      "Browser mixer, editor, and MIDI workflow included.",
      "Great for repeat sessions, live-set prep, and ongoing projects.",
      "The best fit when Burnt Beats is part of your weekly workflow.",
    ],
    cta: "Start Premium",
  },
  {
    id: "studio",
    name: "Studio",
    priceLabel: "$25/month",
    badge: "For power users",
    description: "For engineers, studios, and heavy users keeping multiple projects moving.",
    details: [
      "600 tokens/month (1 token = 1 minute).",
      "Highest-quality stem options and full multi-stem workflow.",
      "Priority queue placement for heavier session volume.",
      "Built for frequent exports, revisions, and multi-track work.",
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
    description: "A low-risk way to open the workstation for one track.",
    details: [
      "4 tokens (enough for ~4 minutes of audio).",
      "Perfect for testing Burnt Beats on one song.",
      "No recurring charges, ever.",
      "Standard-quality stems plus browser-based mix and export workflow.",
      "Buy again any time you need another one-off session.",
    ],
    cta: "Buy Single Pack",
  },
  {
    id: "topup",
    name: "Top-Up Pack",
    priceLabel: "$5 one-time",
    badge: "Most flexible",
    highlight: true,
    description: "Open the workstation when you need stems, without a monthly plan.",
    details: [
      "One-time purchase of tokens — no recurring charge.",
      "Use the same high-quality stem engine as monthly plans.",
      "Great for one-off edits, guest work, and occasional sessions.",
      "Top up again any time you run low.",
      "No plan required if Burnt Beats is not part of your regular workflow.",
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
