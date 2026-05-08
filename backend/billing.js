// @ts-check
/**
 * Billing — thin re-export shim.
 *
 * All implementation has moved to ./billing/ modules.
 * This file preserves backward compatibility for existing consumers.
 *
 * See: backend/billing/index.js for the full module map.
 */
export { billingRouter } from "./billing/index.js";
