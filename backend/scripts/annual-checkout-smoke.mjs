#!/usr/bin/env node
// @ts-check
/**
 * Annual billing smoke test — verifies env → price resolution → Stripe API.
 *
 * Does NOT complete a payment. Optionally creates one checkout session and
 * expires it immediately (live or test key, depending on STRIPE_SECRET_KEY).
 *
 * Usage (on EC2, inside backend container):
 *   docker exec burntbeats-aws-backend-1 node /app/scripts/annual-checkout-smoke.mjs
 *
 * Usage (local, from repo root):
 *   node --env-file=.env backend/scripts/annual-checkout-smoke.mjs
 *
 * Options:
 *   --no-session     Skip checkout session create/expire (price checks only)
 *   --plan=<name>    Plan for session smoke (default: premium)
 */
import { getStripe } from "../billing/stripeClient.js";
import {
  isAnnualBillingEnabled,
  resolveCheckoutPriceId,
} from "../billing/priceResolver.js";

const PLANS = ["basic", "premium", "studio"];
const args = process.argv.slice(2);
const skipSession = args.includes("--no-session");
const planArg = args.find((a) => a.startsWith("--plan="));
const sessionPlan = planArg ? planArg.split("=")[1] : "premium";

/** @param {string} label */
function pass(label) {
  console.log(`  OK  ${label}`);
}

/** @param {string} label @param {string} [detail] */
function fail(label, detail) {
  console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`);
}

/**
 * @param {import("stripe").Stripe} stripe
 * @param {string} plan
 * @returns {Promise<boolean>}
 */
async function verifyPlanPrices(stripe, plan) {
  const monthly = resolveCheckoutPriceId(plan, "month");
  const annual = resolveCheckoutPriceId(plan, "year");

  console.log(`--- ${plan} ---`);
  console.log(`  monthly price id: ${monthly || "(missing)"}`);
  console.log(`  annual price id:  ${annual || "(missing)"}`);

  if (!annual) {
    fail(`${plan} annual price id missing`);
    return false;
  }
  if (!monthly) {
    fail(`${plan} monthly price id missing`);
    return false;
  }
  if (annual === monthly) {
    fail(`${plan} annual id equals monthly id`);
    return false;
  }

  try {
    const price = await stripe.prices.retrieve(annual);
    const yearly =
      price.active === true && price.recurring?.interval === "year";
    const amount =
      price.unit_amount != null
        ? `$${(price.unit_amount / 100).toFixed(2)}/yr`
        : "n/a";
    console.log(
      `  Stripe: active=${price.active} interval=${price.recurring?.interval ?? "n/a"} amount=${amount}`,
    );
    if (!yearly) {
      fail(`${plan} Stripe price not active yearly`);
      return false;
    }
    pass(`${plan} annual price verified in Stripe`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`${plan} stripe.prices.retrieve`, message);
    return false;
  }
}

/**
 * @param {import("stripe").Stripe} stripe
 * @param {string} plan
 * @returns {Promise<boolean>}
 */
async function verifyCheckoutSession(stripe, plan) {
  const priceId = resolveCheckoutPriceId(plan, "year");
  if (!priceId) {
    fail(`session smoke: no annual price for ${plan}`);
    return false;
  }

  console.log(`--- checkout session (${plan} annual) ---`);
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `https://burntbeats.com?checkout=success&plan=${plan}`,
      cancel_url: "https://burntbeats.com?checkout=cancelled",
      metadata: { plan, interval: "year", smoke_test: "annual-checkout-smoke" },
      subscription_data: {
        metadata: { plan, interval: "year", smoke_test: "annual-checkout-smoke" },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail("checkout.sessions.create", message);
    return false;
  }

  try {
    const items = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 5,
    });
    const linePrice = items.data[0]?.price?.id;
    console.log(`  session id: ${session.id}`);
    console.log(`  mode: ${session.mode}`);
    console.log(`  line item price: ${linePrice ?? "(none)"}`);

    if (session.mode !== "subscription" || linePrice !== priceId) {
      fail("session line item mismatch");
      return false;
    }
    pass("checkout session created with correct annual price");
    return true;
  } finally {
    try {
      await stripe.checkout.sessions.expire(session.id);
      pass("checkout session expired (no open checkout left)");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  WARN  could not expire session ${session.id}: ${message}`);
    }
  }
}

async function main() {
  console.log("Annual checkout smoke test");
  console.log(`ANNUAL_BILLING_ENABLED=${isAnnualBillingEnabled()}`);

  if (!isAnnualBillingEnabled()) {
    fail("ANNUAL_BILLING_ENABLED is off");
    process.exit(1);
  }

  const stripe = getStripe();
  if (!stripe) {
    fail("Stripe client unavailable — set STRIPE_SECRET_KEY");
    process.exit(1);
  }

  let failures = 0;
  for (const plan of PLANS) {
    const ok = await verifyPlanPrices(stripe, plan);
    if (!ok) failures++;
  }

  if (!skipSession) {
    if (!PLANS.includes(sessionPlan)) {
      fail(`unknown --plan=${sessionPlan}`);
      process.exit(1);
    }
    const ok = await verifyCheckoutSession(stripe, sessionPlan);
    if (!ok) failures++;
  } else {
    console.log("--- checkout session ---");
    console.log("  skipped (--no-session)");
  }

  console.log("");
  if (failures === 0) {
    console.log("RESULT: PASS");
    process.exit(0);
  }
  console.log(`RESULT: FAIL (${failures} check(s) failed)`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
