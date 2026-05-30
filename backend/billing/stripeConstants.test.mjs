import test from "node:test";
import assert from "node:assert/strict";
import {
  STRIPE_API_VERSION,
  isStripeSecretKey,
} from "./stripeConstants.js";

test("STRIPE_API_VERSION is pinned", () => {
  assert.equal(STRIPE_API_VERSION, "2026-04-22.dahlia");
});

test("isStripeSecretKey accepts sk_ and rk_ keys", () => {
  assert.equal(isStripeSecretKey("sk_test_abc"), true);
  assert.equal(isStripeSecretKey("sk_live_abc"), true);
  assert.equal(isStripeSecretKey("rk_test_abc"), true);
  assert.equal(isStripeSecretKey("rk_live_abc"), true);
  assert.equal(isStripeSecretKey("pk_test_abc"), false);
  assert.equal(isStripeSecretKey(""), false);
});
