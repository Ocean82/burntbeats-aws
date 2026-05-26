// @ts-check

import { publicErrorMessage } from "../../clientSafeError.js";
import { verifyClerkBearer } from "../../clerkAuth.js";
import {
  getExpandEntitlementError,
  getSplitEntitlementError,
  isPremiumStemQuality,
  resolveEntitlementStateForUser,
} from "../../billing/entitlements.js";

/**
 * @param {unknown} err
 * @returns {number}
 */
function entitlementErrorStatus(err) {
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof /** @type {{ status?: unknown }} */ (err).status === "number"
  ) {
    return /** @type {{ status: number }} */ (err).status;
  }
  return 500;
}

/**
 * @param {unknown} err
 * @param {string} logPrefix
 * @returns {{ ok: false; status: number; error: string }}
 */
function entitlementAuthFailure(err, logPrefix) {
  const status = entitlementErrorStatus(err);
  const raw = err instanceof Error ? err.message : String(err);
  const fallback =
    status === 401
      ? "Unable to verify your account. Please sign in again."
      : "Unable to verify premium entitlements.";
  return {
    ok: false,
    status,
    error:
      status === 401 ? fallback : publicErrorMessage(raw, fallback, logPrefix),
  };
}

/**
 * @param {string} stems
 * @param {string | undefined} quality
 * @returns {boolean}
 */
export function isPremiumSplitRequest(stems, quality) {
  return stems === "4" || isPremiumStemQuality(quality);
}

/**
 * @param {import("express").Request | { _usageUserId?: string; headers?: Record<string, unknown> }} req
 * @param {{
 *   verifyClerkBearer?: (req: import("express").Request | { _usageUserId?: string; headers?: Record<string, unknown> }) => Promise<string>;
 *   resolveEntitlementStateForUser?: (userId: string) => Promise<import("../../billing/entitlements.js").EntitlementState>;
 * }} [deps]
 * @returns {Promise<{ ok: true; userId: string; entitlements: import("../../billing/entitlements.js").EntitlementState } | { ok: false; status: number; error: string }>}
 */
async function resolveRequestEntitlements(req, deps = {}) {
  const readUserId = deps.verifyClerkBearer || verifyClerkBearer;
  const readEntitlements =
    deps.resolveEntitlementStateForUser || resolveEntitlementStateForUser;
  try {
    const cachedUserId =
      "_usageUserId" in req && typeof req._usageUserId === "string"
        ? req._usageUserId
        : null;
    const userId = cachedUserId || (await readUserId(req));
    const entitlements = await readEntitlements(userId);
    return { ok: true, userId, entitlements };
  } catch (err) {
    return entitlementAuthFailure(err, "[stem entitlement]");
  }
}

/**
 * @param {import("express").Request | { _usageUserId?: string; headers?: Record<string, unknown> }} req
 * @param {{ stems: string; quality: string | undefined }} request
 * @param {{
 *   verifyClerkBearer?: (req: import("express").Request | { _usageUserId?: string; headers?: Record<string, unknown> }) => Promise<string>;
 *   resolveEntitlementStateForUser?: (userId: string) => Promise<import("../../billing/entitlements.js").EntitlementState>;
 * }} [deps]
 * @returns {Promise<{ ok: true; userId: string; entitlements: import("../../billing/entitlements.js").EntitlementState } | { ok: false; status: number; error: string }>}
 */
export async function requireSplitEntitlements(req, request, deps = {}) {
  const resolved = await resolveRequestEntitlements(req, deps);
  if (!resolved.ok) return resolved;
  const denial = getSplitEntitlementError({
    stems: request.stems,
    quality: request.quality,
    entitlements: resolved.entitlements,
  });
  if (denial) return { ok: false, ...denial };
  return resolved;
}

/**
 * @param {import("express").Request | { _usageUserId?: string; headers?: Record<string, unknown> }} req
 * @param {{
 *   verifyClerkBearer?: (req: import("express").Request | { _usageUserId?: string; headers?: Record<string, unknown> }) => Promise<string>;
 *   resolveEntitlementStateForUser?: (userId: string) => Promise<import("../../billing/entitlements.js").EntitlementState>;
 * }} [deps]
 * @returns {Promise<{ ok: true; userId: string; entitlements: import("../../billing/entitlements.js").EntitlementState } | { ok: false; status: number; error: string }>}
 */
export async function requireExpandEntitlements(req, deps = {}) {
  const resolved = await resolveRequestEntitlements(req, deps);
  if (!resolved.ok) return resolved;
  const denial = getExpandEntitlementError(resolved.entitlements);
  if (denial) return { ok: false, ...denial };
  return resolved;
}
