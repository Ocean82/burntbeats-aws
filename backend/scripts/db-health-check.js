#!/usr/bin/env node
// @ts-check
/**
 * Quick diagnostic script to check DB connectivity and schema state.
 *
 * Usage:
 *   node --env-file=.env scripts/db-health-check.js
 */
import pg from "pg";

const url = (process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});

async function run() {
  console.log("🔍 Connecting to database...");
  await client.connect();
  console.log("✅ Connected\n");

  // Check 1: Basic connectivity
  const {
    rows: [{ now }],
  } = await client.query("SELECT now()");
  console.log(`⏰ Server time: ${now}\n`);

  // Check 2: Users table
  try {
    const { rows } = await client.query("SELECT count(*) as cnt FROM users");
    console.log(`✅ users table exists — ${rows[0].cnt} rows`);
  } catch (err) {
    console.error(`❌ users table missing: ${err.message}`);
  }

  // Check 3: user_token_balances table + columns
  try {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'user_token_balances' ORDER BY ordinal_position`,
    );
    const cols = rows.map((r) => r.column_name);
    console.log(`✅ user_token_balances columns: ${cols.join(", ")}`);

    if (!cols.includes("free_monthly_remaining")) {
      console.error(
        "❌ MISSING: free_monthly_remaining column — migration 003 not applied!",
      );
    }
    if (!cols.includes("free_monthly_period")) {
      console.error(
        "❌ MISSING: free_monthly_period column — migration 003 not applied!",
      );
    }
    if (!cols.includes("max_entitlement_tier")) {
      console.error(
        "❌ MISSING: max_entitlement_tier column — migration 003 not applied!",
      );
    }
  } catch (err) {
    console.error(`❌ user_token_balances table missing: ${err.message}`);
  }

  // Check 4: token_tx_type enum values
  try {
    const { rows } = await client.query(
      `SELECT enumlabel FROM pg_enum 
       JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
       WHERE typname = 'token_tx_type' ORDER BY enumsortorder`,
    );
    const values = rows.map((r) => r.enumlabel);
    console.log(`✅ token_tx_type enum values: ${values.join(", ")}`);

    if (!values.includes("free_monthly_debit")) {
      console.error(
        "❌ MISSING: 'free_monthly_debit' enum value — migration 003 not applied!",
      );
    }
  } catch (err) {
    console.error(`❌ token_tx_type enum check failed: ${err.message}`);
  }

  // Check 5: token_transactions table
  try {
    const { rows } = await client.query(
      "SELECT count(*) as cnt FROM token_transactions",
    );
    console.log(`✅ token_transactions table exists — ${rows[0].cnt} rows`);
  } catch (err) {
    console.error(`❌ token_transactions table missing: ${err.message}`);
  }

  // Check 6: jobs table
  try {
    const { rows } = await client.query("SELECT count(*) as cnt FROM jobs");
    console.log(`✅ jobs table exists — ${rows[0].cnt} rows`);
  } catch (err) {
    console.error(`❌ jobs table missing: ${err.message}`);
  }

  console.log("\n--- Done ---");
}

run()
  .catch((err) => {
    console.error(`\n❌ FATAL: ${err.message}`);
    process.exit(1);
  })
  .finally(() => client.end());
