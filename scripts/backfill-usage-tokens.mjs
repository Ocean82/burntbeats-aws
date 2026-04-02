#!/usr/bin/env node
/**
 * Backfill or repair Clerk private_metadata.usageTokens from Stripe subscription state.
 *
 * Default: dry-run (prints planned changes, no writes).
 * Writes only with --apply.
 *
 * Usage:
 *   node scripts/backfill-usage-tokens.mjs --clerk-user-id user_xxx
 *   node scripts/backfill-usage-tokens.mjs --stripe-customer cus_xxx
 *   node scripts/backfill-usage-tokens.mjs --all-active
 *   node scripts/backfill-usage-tokens.mjs --clerk-user-id user_xxx --apply
 *   node scripts/backfill-usage-tokens.mjs --clerk-user-id user_xxx --apply --force
 *
 * --force: apply even if lastCreditedPeriodStart already matches current period (rewrites balance from Stripe grant).
 *
 * Reads backend/.env for STRIPE_SECRET_KEY, CLERK_SECRET_KEY, USAGE_DEFAULT_TOKENS_PER_MONTH.
 */
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), "backend", ".env");

function parseEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${filePath}`);
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

function parseArgs(argv) {
  const out = { apply: false, force: false, clerkUserIds: [], stripeCustomers: [], allActive: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--force") out.force = true;
    else if (a === "--all-active") out.allActive = true;
    else if (a === "--clerk-user-id" && argv[i + 1]) {
      out.clerkUserIds.push(argv[++i]);
    } else if (a.startsWith("--clerk-user-id=")) {
      out.clerkUserIds.push(a.slice("--clerk-user-id=".length));
    } else if (a === "--stripe-customer" && argv[i + 1]) {
      out.stripeCustomers.push(argv[++i]);
    } else if (a.startsWith("--stripe-customer=")) {
      out.stripeCustomers.push(a.slice("--stripe-customer=".length));
    }
  }
  return out;
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const txt = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url}: ${txt.slice(0, 400)}`);
  return JSON.parse(txt);
}

function tokensPerMonthFromPrice(price, defaultMonthly) {
  const meta = price?.metadata || {};
  if (meta.tokens_per_month != null && meta.tokens_per_month !== "") {
    const n = Number(meta.tokens_per_month);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  if (meta.token_allowance != null && meta.token_allowance !== "") {
    const n = Number(meta.token_allowance);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  if (meta.token_seconds_per_month != null && meta.token_seconds_per_month !== "") {
    const sec = Number(meta.token_seconds_per_month);
    if (Number.isFinite(sec) && sec > 0) return Math.max(1, Math.ceil(sec / 60));
  }
  const def = Number(defaultMonthly);
  return Number.isFinite(def) && def > 0 ? Math.floor(def) : 0;
}

async function patchClerkUser(clerkKey, userId, body) {
  const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${clerkKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Clerk PATCH ${userId}: ${res.status} ${txt.slice(0, 400)}`);
  return JSON.parse(txt);
}

/**
 * @param {{ env: Record<string,string>, stripeHeaders: Record<string,string>, clerkKey: string, apply: boolean, force: boolean }} ctx
 * @param {{ sub: object, clerkUserId: string }} row
 */
async function processSubscription(ctx, row) {
  const { sub, clerkUserId } = row;
  const subAny = /** @type {any} */ (sub);
  const item = sub.items?.data?.[0];
  /** Stripe may put billing period on items only (not top-level subscription). */
  const periodStart =
    subAny.current_period_start ?? item?.current_period_start;
  const periodEnd =
    subAny.current_period_end ?? item?.current_period_end;
  const rawPrice = item?.price;
  const priceId =
    typeof rawPrice === "string" ? rawPrice : rawPrice?.id;
  if (!priceId) {
    console.log(`  SKIP ${clerkUserId}: no price on subscription`);
    return { skipped: true, reason: "no_price" };
  }

  const price = await getJson(`https://api.stripe.com/v1/prices/${priceId}`, {
    headers: ctx.stripeHeaders,
  });
  const defaultMonthly = Number(ctx.env.USAGE_DEFAULT_TOKENS_PER_MONTH) || 0;
  const grant = tokensPerMonthFromPrice(price, defaultMonthly);
  if (!grant || grant <= 0) {
    console.log(
      `  SKIP ${clerkUserId}: tokens_per_month / default grant is 0 (price=${priceId})`,
    );
    return { skipped: true, reason: "zero_grant" };
  }
  const periodEndMs = periodEnd != null ? periodEnd * 1000 : null;

  const user = await getJson(`https://api.clerk.com/v1/users/${clerkUserId}`, {
    headers: { Authorization: `Bearer ${ctx.clerkKey}` },
  });

  const prev = user.private_metadata?.usageTokens;
  const rec =
    prev && typeof prev === "object"
      ? { .../** @type {Record<string, unknown>} */ (prev) }
      : {};

  const lastCredited = Number(rec.lastCreditedPeriodStart);
  const alreadyCredited =
    Number.isFinite(lastCredited) &&
    Number.isFinite(periodStart) &&
    lastCredited === periodStart;

  if (alreadyCredited && !ctx.force) {
    console.log(
      `  OK ${clerkUserId}: already credited for period ${periodStart} (use --force to overwrite)`,
    );
    return { skipped: true, reason: "already_credited" };
  }

  if (alreadyCredited && ctx.force) {
    console.warn(
      `  WARN: --force will set balance to monthly grant (${grant}) only; top-ups or manual balance changes are not preserved.`,
    );
  }

  const curBal = Number(rec.balance) || 0;
  /** Prior run without period fields could set balance with no lastCreditedPeriodStart — repair period only, no second grant. */
  const periodOnlyRepair =
    !Number.isFinite(lastCredited) &&
    Number.isFinite(periodStart) &&
    curBal > 0 &&
    curBal === grant;
  let newBal;
  if (alreadyCredited && ctx.force) {
    newBal = grant;
  } else if (periodOnlyRepair) {
    newBal = curBal;
  } else {
    newBal = curBal + grant;
  }

  const nextUsage = {
    ...rec,
    balance: newBal,
    periodEnd: periodEndMs,
    lastCreditedPeriodStart: periodStart,
    lastCreditAt: Date.now(),
    lastCreditAmount: grant,
    backfilledAt: Date.now(),
    backfillSource: "scripts/backfill-usage-tokens.mjs",
  };

  const payload = {
    private_metadata: {
      .../** @type {Record<string, unknown>} */ (user.private_metadata || {}),
      usageTokens: nextUsage,
    },
  };

  console.log(`  Plan: sub=${sub.id} price=${priceId} grant=${grant} period=${periodStart} -> ${periodEnd}`);
  console.log(`  Balance: ${curBal} -> ${newBal} (grant add mode: ${alreadyCredited && ctx.force ? "replace" : "add"})`);

  if (!ctx.apply) {
    console.log(`  DRY-RUN: would PATCH Clerk user ${clerkUserId}`);
    return { dryRun: true };
  }

  await patchClerkUser(ctx.clerkKey, clerkUserId, payload);
  console.log(`  APPLIED: Clerk user ${clerkUserId}`);
  return { applied: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = parseEnv(envPath);
  const stripeKey = env.STRIPE_SECRET_KEY || "";
  const clerkKey = env.CLERK_SECRET_KEY || "";
  if (!stripeKey.startsWith("sk_")) throw new Error("Invalid STRIPE_SECRET_KEY in backend/.env");
  if (!clerkKey.startsWith("sk_")) throw new Error("Invalid CLERK_SECRET_KEY in backend/.env");

  const stripeHeaders = { Authorization: `Bearer ${stripeKey}` };
  const ctx = { env, stripeHeaders, clerkKey, apply: args.apply, force: args.force };

  const targets = [];

  if (args.allActive) {
    /** @type {any[]} */
    const subs = [];
    let startingAfter = "";
    while (true) {
      const q = new URLSearchParams({ status: "active", limit: "100" });
      if (startingAfter) q.set("starting_after", startingAfter);
      const page = await getJson(
        `https://api.stripe.com/v1/subscriptions?${q.toString()}`,
        { headers: stripeHeaders },
      );
      const data = page.data || [];
      subs.push(...data);
      if (!page.has_more || data.length === 0) break;
      startingAfter = data[data.length - 1].id;
    }
    for (const sub of subs) {
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      const customer = await getJson(`https://api.stripe.com/v1/customers/${customerId}`, {
        headers: stripeHeaders,
      });
      const clerkUserId = customer.metadata?.clerkUserId;
      if (!clerkUserId) {
        console.warn(`WARN: customer ${customerId} has no clerkUserId — skip`);
        continue;
      }
      targets.push({ sub, clerkUserId });
    }
  }

  for (const id of args.clerkUserIds) {
    const user = await getJson(`https://api.clerk.com/v1/users/${id}`, {
      headers: { Authorization: `Bearer ${clerkKey}` },
    });
    const customerId = user.public_metadata?.stripeCustomerId;
    if (!customerId) {
      console.error(`ERROR: Clerk user ${id} has no public_metadata.stripeCustomerId`);
      process.exitCode = 1;
      continue;
    }
    const subs = await getJson(
      `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=active&limit=5`,
      { headers: stripeHeaders },
    );
    const sub = (subs.data || [])[0];
    if (!sub) {
      console.error(`ERROR: No active Stripe subscription for customer ${customerId}`);
      process.exitCode = 1;
      continue;
    }
    targets.push({ sub, clerkUserId: id });
  }

  for (const cus of args.stripeCustomers) {
    const customer = await getJson(`https://api.stripe.com/v1/customers/${cus}`, {
      headers: stripeHeaders,
    });
    const clerkUserId = customer.metadata?.clerkUserId;
    if (!clerkUserId) {
      console.error(`ERROR: Stripe customer ${cus} has no clerkUserId metadata`);
      process.exitCode = 1;
      continue;
    }
    const subs = await getJson(
      `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(cus)}&status=active&limit=5`,
      { headers: stripeHeaders },
    );
    const sub = (subs.data || [])[0];
    if (!sub) {
      console.error(`ERROR: No active subscription for ${cus}`);
      process.exitCode = 1;
      continue;
    }
    targets.push({ sub, clerkUserId });
  }

  if (targets.length === 0) {
    console.error(
      "Usage: node scripts/backfill-usage-tokens.mjs [--clerk-user-id ID] [--stripe-customer cus_xxx] [--all-active] [--apply] [--force]",
    );
    process.exit(1);
  }

  /** @type {Map<string, { sub: object, clerkUserId: string }>} */
  const byUser = new Map();
  for (const row of targets) byUser.set(row.clerkUserId, row);
  const uniqueTargets = [...byUser.values()];

  console.log(args.apply ? "MODE: APPLY (writes to Clerk)" : "MODE: DRY-RUN (no writes)");
  if (args.force) console.log("FLAG: --force (may overwrite balance for current period)");

  let errors = 0;
  for (const row of uniqueTargets) {
    console.log(`\n--- ${row.clerkUserId} ---`);
    try {
      await processSubscription(ctx, row);
    } catch (e) {
      console.error(`  ERROR: ${e instanceof Error ? e.message : e}`);
      errors++;
    }
  }

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
