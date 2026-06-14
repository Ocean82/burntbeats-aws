// @ts-check
/**
 * Usage tokens barrel — re-exports all public symbols.
 *
 * Consumers can import from "./usage/index.js" or the original
 * "./usageTokens.js" shim (which re-exports from here).
 */

// Token cost computation (pure functions)
export {
  isSampleModeEnabled,
  computeTokensFromDurationSeconds,
  computeSplitCost,
  computeExpandCost,
  computeServerExportCost,
  calculateSampleModeCost,
} from "./tokenCost.js";

// Balance retrieval and feature gating
export {
  isUsageTokensEnabled,
  getUsageBalance,
  withUserUsageLock,
} from "./tokenBalance.js";

// Reserve/refund/welcome operations
export {
  reserveUsageTokens,
  refundUsageTokens,
  grantWelcomeSignupTokens,
} from "./tokenOperations.js";

// Subscription and top-up credits
export {
  creditSubscriptionAllowance,
  creditTopupTokens,
} from "./tokenCredits.js";

// Stripe metadata parsing (shared with billing)
export {
  subscriptionBillingPeriod,
  tokensPerMonthFromPrice,
  tokensPerTopupFromPrice,
  entitlementTierFromPrice,
} from "./stripeMetadata.js";

// Audio file utilities
export {
  getAudioDurationSeconds,
  findJobInputPath,
} from "./audioFile.js";
