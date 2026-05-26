import test from "node:test";
import assert from "node:assert/strict";

import express from "express";
import supertest from "supertest";

import { createSubscriptionRouter } from "./subscription.js";

function createTestApp(deps) {
  const app = express();
  app.use(createSubscriptionRouter(deps));
  return supertest(app);
}

test("GET /subscription returns explicit premium capabilities", async () => {
  const request = createTestApp({
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
    getUsageBalance: async () => ({ balance: 0, periodEnd: null }),
  });

  const res = await request
    .get("/subscription")
    .set("authorization", "Bearer token")
    .expect(200);

  assert.deepEqual(res.body, {
    active: true,
    plan: "premium",
    entitlementSource: "subscription",
    capabilities: {
      canSplitFourStems: true,
      canExpandToFourStems: true,
      canUsePremiumStemQualities: true,
      canUseBatchQueue: true,
    },
  });
});

test("GET /subscription exposes limited capabilities for usage-token basic access", async () => {
  const request = createTestApp({
    verifyClerkBearer: async () => "user_basic",
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
    getUsageBalance: async () => ({ balance: 8, periodEnd: null }),
  });

  const res = await request
    .get("/subscription")
    .set("authorization", "Bearer token")
    .expect(200);

  assert.deepEqual(res.body, {
    active: true,
    plan: "basic",
    entitlementSource: "usage_tokens",
    capabilities: {
      canSplitFourStems: false,
      canExpandToFourStems: false,
      canUsePremiumStemQualities: false,
      canUseBatchQueue: false,
    },
  });
});

test("GET /subscription fails closed for unknown active plans", async () => {
  const request = createTestApp({
    verifyClerkBearer: async () => "user_unknown",
    resolveEntitlementStateForUser: async () => ({
      plan: "unknown",
      entitlementSource: "subscription",
      capabilities: {
        canSplitFourStems: false,
        canExpandToFourStems: false,
        canUsePremiumStemQualities: false,
        canUseBatchQueue: false,
      },
    }),
    getUsageBalance: async () => ({ balance: 0, periodEnd: null }),
  });

  const res = await request
    .get("/subscription")
    .set("authorization", "Bearer token")
    .expect(200);

  assert.deepEqual(res.body, {
    active: true,
    plan: "unknown",
    entitlementSource: "subscription",
    capabilities: {
      canSplitFourStems: false,
      canExpandToFourStems: false,
      canUsePremiumStemQualities: false,
      canUseBatchQueue: false,
    },
  });
});
