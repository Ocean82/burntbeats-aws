import test from "node:test";
import assert from "node:assert/strict";

import {
  requireExpandEntitlements,
  requireSplitEntitlements,
} from "./entitlements.js";

test("requireSplitEntitlements rejects limited users requesting four stems", async () => {
  const result = await requireSplitEntitlements(
    {
      _usageUserId: "user_basic",
      headers: {},
    },
    {
      stems: "4",
      quality: "speed",
    },
    {
      verifyClerkBearer: async () => {
        throw new Error("should not verify bearer when usage user is cached");
      },
      resolveEntitlementStateForUser: async () => ({
        plan: "basic",
        entitlementSource: "usage_tokens",
        capabilities: {
          canSplitFourStems: false,
          canExpandToFourStems: false,
          canUsePremiumStemQualities: false,
          canUseBatchQueue: false,
        },
      }),
    },
  );

  assert.deepEqual(result, {
    ok: false,
    status: 403,
    error: "4-stem split requires Premium or Studio.",
  });
});

test("requireSplitEntitlements allows premium users and returns the resolved user id", async () => {
  const result = await requireSplitEntitlements(
    {
      headers: { authorization: "Bearer token" },
    },
    {
      stems: "4",
      quality: "ultra",
    },
    {
      verifyClerkBearer: async () => "user_premium",
      resolveEntitlementStateForUser: async () => ({
        plan: "premium",
        entitlementSource: "subscription",
        capabilities: {
          canSplitFourStems: true,
          canExpandToFourStems: true,
          canUsePremiumStemQualities: true,
          canUseBatchQueue: true,
        },
      }),
    },
  );

  assert.deepEqual(result, {
    ok: true,
    userId: "user_premium",
    entitlements: {
      plan: "premium",
      entitlementSource: "subscription",
      capabilities: {
        canSplitFourStems: true,
        canExpandToFourStems: true,
        canUsePremiumStemQualities: true,
        canUseBatchQueue: true,
      },
    },
  });
});

test("requireExpandEntitlements rejects unauthenticated premium requests", async () => {
  const result = await requireExpandEntitlements(
    {
      headers: {},
    },
    {
      verifyClerkBearer: async () => {
        throw Object.assign(new Error("Missing auth token"), { status: 401 });
      },
      resolveEntitlementStateForUser: async () => {
        throw new Error("should not resolve entitlements when auth fails");
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    status: 401,
    error: "Unable to verify your account. Please sign in again.",
  });
});
