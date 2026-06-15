#!/usr/bin/env node
/**
 * Debug entitlements for active Stripe subscribers (read-only).
 * Usage: node scripts/debug-user-entitlements.mjs [clerkUserIdOrEmail]
 */
import fs from "fs";
import path from "path";

import { resolvePathWithinBase } from "../backend/helpers/safePath.js";

const root = process.cwd();
const envPath = resolvePathWithinBase(root, "backend", ".env");
if (!envPath) {
  throw new Error("Invalid env file path");
}
const filterArg = process.argv[2]?.trim().toLowerCase() || "";

function parseEnvFile(filePath) {
  const env = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

async function apiGet(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

function planFromPrice(priceId, priceIds) {
  for (const [plan, id] of Object.entries(priceIds)) {
    if (id && id === priceId) return plan;
  }
  return "unknown";
}

function buildCapabilities(plan) {
  const isPremium = plan === "premium" || plan === "studio";
  return {
    canSplitFourStems: isPremium,
    canUsePremiumStemQualities: isPremium,
    canExpandToFourStems: isPremium,
  };
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error(`Missing ${envPath}`);
    process.exit(1);
  }
  const env = parseEnvFile(envPath);
  const stripeKey = env.STRIPE_SECRET_KEY || "";
  const clerkKey = env.CLERK_SECRET_KEY || "";
  const priceIds = {
    basic: env.STRIPE_PRICE_ID_BASIC || "",
    premium: env.STRIPE_PRICE_ID_PREMIUM || "",
    studio: env.STRIPE_PRICE_ID_STUDIO || "",
    topup: env.STRIPE_PRICE_ID_TOPUP || "",
    single: env.STRIPE_PRICE_ID_SINGLE || "",
  };

  console.log("Configured price IDs:");
  for (const [k, v] of Object.entries(priceIds)) console.log(`  ${k}: ${v || "(missing)"}`);
  console.log("");

  const stripeHeaders = { Authorization: `Bearer ${stripeKey}` };
  const clerkHeaders = { Authorization: `Bearer ${clerkKey}` };

  const subsResp = await apiGet(
    "https://api.stripe.com/v1/subscriptions?status=active&limit=100",
    stripeHeaders,
  );

  for (const sub of subsResp.data || []) {
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const priceId = sub.items?.data?.[0]?.price?.id || "";
    const cust = await apiGet(
      `https://api.stripe.com/v1/customers/${customerId}`,
      stripeHeaders,
    );
    const clerkUserId = cust.metadata?.clerkUserId || "";
    let email = cust.email || "";
    let clerkUser = null;
    if (clerkUserId) {
      try {
        clerkUser = await apiGet(
          `https://api.clerk.com/v1/users/${clerkUserId}`,
          clerkHeaders,
        );
        email =
          clerkUser.email_addresses?.[0]?.email_address || email || "?";
      } catch {
        /* ignore */
      }
    }

    const hay = `${email} ${clerkUserId}`.toLowerCase();
    if (filterArg && !hay.includes(filterArg) && filterArg !== clerkUserId) continue;

    const plan = planFromPrice(priceId, priceIds);
    const caps = buildCapabilities(plan);
    const usage = clerkUser?.private_metadata?.usageTokens;
    const balance = Number(usage?.balance);
    const clerkStripe = clerkUser?.public_metadata?.stripeCustomerId;

    console.log("---");
    console.log(`email:           ${email}`);
    console.log(`clerk_user_id:   ${clerkUserId || "(missing)"}`);
    console.log(`stripe_customer: ${customerId}`);
    console.log(`subscription:    ${sub.id}`);
    console.log(`stripe_price:    ${priceId}`);
    console.log(`resolved_plan:   ${plan}`);
    console.log(`clerk_stripe_id: ${clerkStripe || "(missing)"}`);
    console.log(`token_balance:   ${Number.isFinite(balance) ? balance : "(n/a)"}`);
    console.log(`capabilities:    ${JSON.stringify(caps)}`);
    if (plan === "unknown") {
      console.log(">>> ISSUE: price id does not match any STRIPE_PRICE_ID_* in .env");
      console.log(">>> UI will show Fast-only and lock 4-stem until env or Stripe price is fixed.");
    }
    if (plan === "basic") {
      console.log(">>> Expected: Fast-only + 2-stem (Basic tier). Upgrade to Premium for 4-stem/Quality.");
    }
  }

  if (filterArg) {
    console.log("\n(Search filter applied; omit argv to list all active subscribers.)");
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
