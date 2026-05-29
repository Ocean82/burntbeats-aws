import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEntitlementState,
  getExpandEntitlementError,
  getSplitEntitlementError,
  resolveEntitlementStateForUser,
} from "./entitlements.js";

test("buildEntitlementState grants premium stem capabilities for premium and studio", () => {
  const premium = buildEntitlementState({
    plan: "premium",
    entitlementSource: "subscription",
  });
  const studio = buildEntitlementState({
    plan: "studio",
    entitlementSource: "subscription",
  });

  for (const state of [premium, studio]) {
    assert.equal(state.capabilities.canSplitFourStems, true);
    assert.equal(state.capabilities.canExpandToFourStems, true);
    assert.equal(state.capabilities.canUsePremiumStemQualities, true);
    assert.equal(state.capabilities.canUseBatchQueue, true);
    assert.equal(state.capabilities.canDownloadFullPreview, true);
    assert.equal(state.capabilities.canShareCleanPreview, true);
  }
});

test("buildEntitlementState keeps usage-token basic access limited", () => {
  const state = buildEntitlementState({
    plan: "basic",
    entitlementSource: "usage_tokens",
  });

  assert.equal(state.plan, "basic");
  assert.equal(state.entitlementSource, "usage_tokens");
  assert.deepEqual(state.capabilities, {
    canSplitFourStems: false,
    canExpandToFourStems: false,
    canUsePremiumStemQualities: false,
    canUseBatchQueue: false,
    canDownloadFullPreview: false,
    canShareCleanPreview: false,
  });
});

test("buildEntitlementState fails closed for unknown or missing plans", () => {
  const unknown = buildEntitlementState({
    plan: "unknown",
    entitlementSource: "subscription",
  });
  const missing = buildEntitlementState({
    plan: null,
    entitlementSource: "none",
  });

  for (const state of [unknown, missing]) {
    assert.equal(state.capabilities.canSplitFourStems, false);
    assert.equal(state.capabilities.canExpandToFourStems, false);
    assert.equal(state.capabilities.canUsePremiumStemQualities, false);
    assert.equal(state.capabilities.canUseBatchQueue, false);
  }
});

test("getSplitEntitlementError blocks four-stem and premium-quality requests for limited plans", () => {
  const limitedState = buildEntitlementState({
    plan: "basic",
    entitlementSource: "usage_tokens",
  });

  assert.deepEqual(getSplitEntitlementError({
    stems: "4",
    quality: "speed",
    entitlements: limitedState,
  }), {
    status: 403,
    error: "4-stem split requires Premium or Studio.",
  });

  assert.deepEqual(getSplitEntitlementError({
    stems: "2",
    quality: "quality",
    entitlements: limitedState,
  }), {
    status: 403,
    error: "Quality split mode requires Premium or Studio.",
  });

  assert.equal(
    getSplitEntitlementError({
      stems: "2",
      quality: "speed",
      entitlements: limitedState,
    }),
    null,
  );
});

test("getExpandEntitlementError blocks limited plans and allows premium", () => {
  const limitedState = buildEntitlementState({
    plan: "basic",
    entitlementSource: "usage_tokens",
  });
  const premiumState = buildEntitlementState({
    plan: "premium",
    entitlementSource: "subscription",
  });

  assert.deepEqual(getExpandEntitlementError(limitedState), {
    status: 403,
    error: "4-stem expand requires Premium or Studio.",
  });
  assert.equal(getExpandEntitlementError(premiumState), null);
});

test("resolveEntitlementStateForUser prefers active subscriptions", async () => {
  const state = await resolveEntitlementStateForUser("user_123", {
    getClerkUser: async () => ({
      publicMetadata: { stripeCustomerId: "cus_123" },
    }),
    getActiveSubscription: async () => ({ id: "sub_123" }),
    planFromSubscription: () => "premium",
    getUsageBalance: async () => ({ balance: 99, periodEnd: null }),
  });

  assert.equal(state.plan, "premium");
  assert.equal(state.entitlementSource, "subscription");
  assert.equal(state.capabilities.canSplitFourStems, true);
});

test("resolveEntitlementStateForUser falls back to usage-token basic access", async () => {
  const state = await resolveEntitlementStateForUser("user_456", {
    getClerkUser: async () => ({
      publicMetadata: {},
    }),
    getActiveSubscription: async () => null,
    planFromSubscription: () => "unknown",
    getUsageBalance: async () => ({ balance: 12, periodEnd: null }),
  });

  assert.equal(state.plan, "basic");
  assert.equal(state.entitlementSource, "usage_tokens");
  assert.equal(state.capabilities.canExpandToFourStems, false);
});

test("resolveEntitlementStateForUser fails closed for unknown subscription plans", async () => {
  const state = await resolveEntitlementStateForUser("user_789", {
    getClerkUser: async () => ({
      publicMetadata: { stripeCustomerId: "cus_789" },
    }),
    getActiveSubscription: async () => ({ id: "sub_789" }),
    planFromSubscription: () => "mystery_plan",
    getUsageBalance: async () => ({ balance: 500, periodEnd: null }),
  });

  assert.equal(state.plan, "unknown");
  assert.equal(state.entitlementSource, "subscription");
  assert.equal(state.capabilities.canUsePremiumStemQualities, false);
});
