// @ts-check

import { getClerkClient } from "../clerkAuth.js";
import { getUsageBalance } from "../usageTokens.js";
import {
  getActiveSubscription,
  planFromSubscription,
} from "./stripeCustomer.js";

/**
 * @typedef {"basic" | "premium" | "studio" | "unknown" | null} NormalizedPlan
 * @typedef {"subscription" | "usage_tokens" | "none"} EntitlementSource
 *
 * @typedef {{
 *   canSplitFourStems: boolean;
 *   canExpandToFourStems: boolean;
 *   canUsePremiumStemQualities: boolean;
 *   canUseBatchQueue: boolean;
 * }} StemEntitlementCapabilities
 *
 * @typedef {{
 *   plan: NormalizedPlan;
 *   entitlementSource: EntitlementSource;
 *   capabilities: StemEntitlementCapabilities;
 * }} EntitlementState
 */

const PREMIUM_CAPABILITIES = Object.freeze({
  canSplitFourStems: true,
  canExpandToFourStems: true,
  canUsePremiumStemQualities: true,
  canUseBatchQueue: true,
});

const LIMITED_CAPABILITIES = Object.freeze({
  canSplitFourStems: false,
  canExpandToFourStems: false,
  canUsePremiumStemQualities: false,
  canUseBatchQueue: false,
});

const PREMIUM_STEM_QUALITIES = new Set(["balanced", "quality", "ultra"]);

/**
 * @param {unknown} plan
 * @returns {NormalizedPlan}
 */
export function normalizeEntitlementPlan(plan) {
  if (plan === "basic" || plan === "premium" || plan === "studio") return plan;
  if (plan == null) return null;
  return "unknown";
}

/**
 * @param {unknown} entitlementSource
 * @returns {EntitlementSource}
 */
export function normalizeEntitlementSource(entitlementSource) {
  if (
    entitlementSource === "subscription" ||
    entitlementSource === "usage_tokens"
  ) {
    return entitlementSource;
  }
  return "none";
}

/**
 * @param {{ plan: unknown; entitlementSource?: unknown }} input
 * @returns {EntitlementState}
 */
export function buildEntitlementState(input) {
  const plan = normalizeEntitlementPlan(input.plan);
  const entitlementSource = normalizeEntitlementSource(input.entitlementSource);
  const isPremiumTier = plan === "premium" || plan === "studio";

  return {
    plan,
    entitlementSource,
    capabilities: isPremiumTier ? PREMIUM_CAPABILITIES : LIMITED_CAPABILITIES,
  };
}

/**
 * @param {string | undefined} quality
 * @returns {boolean}
 */
export function isPremiumStemQuality(quality) {
  return typeof quality === "string" && PREMIUM_STEM_QUALITIES.has(quality);
}

/**
 * @param {{
 *   stems: string;
 *   quality: string | undefined;
 *   entitlements: EntitlementState;
 * }} input
 * @returns {{ status: 403; error: string } | null}
 */
export function getSplitEntitlementError(input) {
  if (input.stems === "4" && !input.entitlements.capabilities.canSplitFourStems) {
    return {
      status: 403,
      error: "4-stem split requires Premium or Studio.",
    };
  }
  if (
    isPremiumStemQuality(input.quality) &&
    !input.entitlements.capabilities.canUsePremiumStemQualities
  ) {
    return {
      status: 403,
      error: "Balanced, Quality, and Ultra split modes require Premium or Studio.",
    };
  }
  return null;
}

/**
 * @param {EntitlementState} entitlements
 * @returns {{ status: 403; error: string } | null}
 */
export function getExpandEntitlementError(entitlements) {
  if (entitlements.capabilities.canExpandToFourStems) return null;
  return {
    status: 403,
    error: "4-stem expand requires Premium or Studio.",
  };
}

/**
 * @param {string} userId
 * @returns {Promise<unknown | null>}
 */
async function defaultGetClerkUser(userId) {
  const clerk = getClerkClient();
  if (!clerk) return null;
  return clerk.users.getUser(userId);
}

/**
 * @param {string} userId
 * @param {{
 *   getClerkUser?: (userId: string) => Promise<unknown | null>;
 *   getActiveSubscription?: (customerId: string) => Promise<unknown | null>;
 *   planFromSubscription?: (sub: unknown) => unknown;
 *   getUsageBalance?: (userId: string) => Promise<{ balance: number; periodEnd: Date | null } | null>;
 * }} [deps]
 * @returns {Promise<EntitlementState>}
 */
export async function resolveEntitlementStateForUser(userId, deps = {}) {
  const readClerkUser = deps.getClerkUser || defaultGetClerkUser;
  const readActiveSubscription = deps.getActiveSubscription || getActiveSubscription;
  const readPlanFromSubscription = deps.planFromSubscription || planFromSubscription;
  const readUsageBalance = deps.getUsageBalance || getUsageBalance;

  const user = await readClerkUser(userId);
  const customerId =
    user &&
    typeof user === "object" &&
    "publicMetadata" in user &&
    user.publicMetadata &&
    typeof user.publicMetadata === "object" &&
    "stripeCustomerId" in user.publicMetadata &&
    typeof user.publicMetadata.stripeCustomerId === "string"
      ? user.publicMetadata.stripeCustomerId
      : "";

  if (customerId) {
    const subscription = await readActiveSubscription(customerId);
    if (subscription) {
      return buildEntitlementState({
        plan: readPlanFromSubscription(subscription),
        entitlementSource: "subscription",
      });
    }
  }

  const usage = await readUsageBalance(userId);
  if (usage && usage.balance > 0) {
    return buildEntitlementState({
      plan: "basic",
      entitlementSource: "usage_tokens",
    });
  }

  return buildEntitlementState({
    plan: null,
    entitlementSource: "none",
  });
}
