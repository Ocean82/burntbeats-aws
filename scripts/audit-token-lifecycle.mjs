#!/usr/bin/env node
/**
 * Read-only token lifecycle audit.
 *
 * Checks:
 * - How many active Stripe subscriptions exist
 * - Stripe customer -> Clerk user linkage
 * - Expected monthly token grant from Stripe price metadata
 * - Clerk private_metadata.usageTokens presence and key fields
 *
 * Usage:
 *   node scripts/audit-token-lifecycle.mjs
 */
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), "backend", ".env");

function parseEnv(filePath) {
  const out = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url}: ${txt.slice(0, 250)}`);
  return JSON.parse(txt);
}

function tokensFromPrice(price, defaultMonthly) {
  const md = price?.metadata || {};
  const tpm = Number(md.tokens_per_month);
  if (Number.isFinite(tpm) && tpm > 0) return Math.floor(tpm);
  const allowance = Number(md.token_allowance);
  if (Number.isFinite(allowance) && allowance > 0) return Math.floor(allowance);
  const sec = Number(md.token_seconds_per_month);
  if (Number.isFinite(sec) && sec > 0) return Math.max(1, Math.ceil(sec / 60));
  return defaultMonthly;
}

function iso(sec) {
  return Number.isFinite(sec) ? new Date(sec * 1000).toISOString() : "n/a";
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error(`Missing env file: ${envPath}`);
    process.exit(1);
  }

  const env = parseEnv(envPath);
  const stripeKey = env.STRIPE_SECRET_KEY || "";
  const clerkKey = env.CLERK_SECRET_KEY || "";
  const defaultMonthly = Number(env.USAGE_DEFAULT_TOKENS_PER_MONTH) || 0;

  if (!stripeKey.startsWith("sk_")) throw new Error("Invalid STRIPE_SECRET_KEY");
  if (!clerkKey.startsWith("sk_")) throw new Error("Invalid CLERK_SECRET_KEY");

  const stripeHeaders = { Authorization: `Bearer ${stripeKey}` };
  const clerkHeaders = { Authorization: `Bearer ${clerkKey}` };

  const subs = await getJson("https://api.stripe.com/v1/subscriptions?status=active&limit=100", stripeHeaders);
  const activeSubs = subs.data || [];
  console.log(`Active subscriptions: ${activeSubs.length}`);
  console.log(`USAGE_TOKENS_ENABLED=${env.USAGE_TOKENS_ENABLED || ""} defaultMonthly=${defaultMonthly}`);

  let issues = 0;
  for (const sub of activeSubs) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const item = sub.items?.data?.[0];
    const priceId = item?.price?.id;
    const periodStart = sub.current_period_start ?? item?.current_period_start;
    const periodEnd = sub.current_period_end ?? item?.current_period_end;
    const price = await getJson(`https://api.stripe.com/v1/prices/${priceId}`, stripeHeaders);
    const expectedGrant = tokensFromPrice(price, defaultMonthly);

    const customer = await getJson(`https://api.stripe.com/v1/customers/${customerId}`, stripeHeaders);
    const clerkUserId = customer.metadata?.clerkUserId || "";
    if (!clerkUserId) {
      issues++;
      console.log(`- ISSUE sub=${sub.id} customer=${customerId}: missing clerkUserId metadata`);
      continue;
    }

    const user = await getJson(`https://api.clerk.com/v1/users/${clerkUserId}`, clerkHeaders);
    const usage = user.private_metadata?.usageTokens || null;
    const balance = Number(usage?.balance);
    const periodEndMs = Number(usage?.periodEnd);
    const lastStart = Number(usage?.lastCreditedPeriodStart);
    const hasUsage = usage && typeof usage === "object";

    const flags = [];
    if (!hasUsage) flags.push("missing_usageTokens");
    if (hasUsage && Number.isFinite(periodEndMs) && Number.isFinite(periodEnd) && periodEndMs !== periodEnd * 1000) {
      flags.push("periodEnd_mismatch");
    }
    if (hasUsage && Number.isFinite(lastStart) && Number.isFinite(periodStart) && lastStart !== periodStart) {
      flags.push("lastCreditedPeriodStart_mismatch");
    }
    if (!user.public_metadata?.stripeCustomerId) flags.push("missing_public_metadata_stripeCustomerId");
    if (user.public_metadata?.stripeCustomerId && user.public_metadata.stripeCustomerId !== customerId) {
      flags.push("stripeCustomerId_mismatch");
    }
    if (flags.length) issues += flags.length;

    console.log(
      [
        `- sub=${sub.id}`,
        `customer=${customerId}`,
        `clerkUser=${clerkUserId}`,
        `price=${priceId}`,
        `expectedGrant=${expectedGrant}`,
        `balance=${Number.isFinite(balance) ? balance : "n/a"}`,
        `stripePeriod=${iso(periodStart)} -> ${iso(periodEnd)}`,
        `flags=${flags.length ? flags.join(",") : "ok"}`,
      ].join(" | "),
    );
  }

  console.log(`\nToken lifecycle audit complete. Issues flagged: ${issues}`);
  if (issues > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(`Audit failed: ${err.message}`);
  process.exit(1);
});

