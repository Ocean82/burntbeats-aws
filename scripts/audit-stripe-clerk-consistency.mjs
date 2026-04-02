#!/usr/bin/env node
/**
 * Read-only consistency audit:
 * - Stripe active subscriptions
 * - Stripe customer -> Clerk user linkage
 * - Clerk privateMetadata.usageTokens presence
 *
 * Usage:
 *   node scripts/audit-stripe-clerk-consistency.mjs
 *
 * Notes:
 * - Reads credentials from backend/.env
 * - Performs NO writes
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const envPath = path.join(root, "backend", ".env");

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
  if (!res.ok) {
    throw new Error(`${res.status} ${url}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

function fmtTs(sec) {
  if (!Number.isFinite(sec)) return "n/a";
  return new Date(sec * 1000).toISOString();
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error(`Missing ${envPath}`);
    process.exit(1);
  }

  const env = parseEnvFile(envPath);
  const stripeKey = env.STRIPE_SECRET_KEY || "";
  const clerkKey = env.CLERK_SECRET_KEY || "";
  const ignoreUsers = new Set(
    (env.AUDIT_IGNORE_CLERK_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  if (!stripeKey.startsWith("sk_")) {
    console.error("Invalid/missing STRIPE_SECRET_KEY in backend/.env");
    process.exit(1);
  }
  if (!clerkKey.startsWith("sk_")) {
    console.error("Invalid/missing CLERK_SECRET_KEY in backend/.env");
    process.exit(1);
  }

  const stripeHeaders = { Authorization: `Bearer ${stripeKey}` };
  const clerkHeaders = { Authorization: `Bearer ${clerkKey}` };

  const subsResp = await apiGet(
    "https://api.stripe.com/v1/subscriptions?status=active&limit=100",
    stripeHeaders,
  );
  const subs = subsResp.data || [];

  console.log(`Active Stripe subscriptions: ${subs.length}`);
  if (subs.length === 0) {
    console.log("No active subscriptions. Consistency audit complete.");
    return;
  }

  let issues = 0;
  for (const sub of subs) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const priceId = sub.items?.data?.[0]?.price?.id || "unknown";
    const periodStart = sub.current_period_start ?? sub.items?.data?.[0]?.current_period_start;
    const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;

    const cust = await apiGet(`https://api.stripe.com/v1/customers/${customerId}`, stripeHeaders);
    const clerkUserId = cust.metadata?.clerkUserId || "";

    if (!clerkUserId) {
      issues++;
      console.log(`- ISSUE sub=${sub.id} customer=${customerId}: missing customer.metadata.clerkUserId`);
      continue;
    }

    let clerkUser = null;
    try {
      clerkUser = await apiGet(`https://api.clerk.com/v1/users/${clerkUserId}`, clerkHeaders);
    } catch (e) {
      issues++;
      console.log(`- ISSUE sub=${sub.id} customer=${customerId}: clerk user not found (${clerkUserId})`);
      continue;
    }

    const usageTokens = clerkUser.private_metadata?.usageTokens;
    const hasUsageTokens = usageTokens && typeof usageTokens === "object";
    const stripeCustomerInClerk = clerkUser.public_metadata?.stripeCustomerId;
    const ignored = ignoreUsers.has(clerkUserId);

    const parts = [
      `sub=${sub.id}`,
      `customer=${customerId}`,
      `clerkUser=${clerkUserId}`,
      `price=${priceId}`,
      `period=${fmtTs(periodStart)} -> ${fmtTs(periodEnd)}`,
      `usageTokens=${hasUsageTokens ? "present" : "missing"}`,
      `clerkStripeCustomer=${stripeCustomerInClerk || "missing"}`,
      `ignored=${ignored ? "yes" : "no"}`,
    ];
    console.log(`- ${parts.join(" | ")}`);

    if (!hasUsageTokens && !ignored) issues++;
    if (!stripeCustomerInClerk) issues++;
    if (stripeCustomerInClerk && stripeCustomerInClerk !== customerId) issues++;
  }

  console.log(`\nAudit done. Potential issues: ${issues}`);
  if (issues > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(`Audit failed: ${err.message}`);
  process.exit(1);
});

