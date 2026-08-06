// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("token ledger enforces unique Stripe credit event ids", () => {
  const schema = fs.readFileSync(path.join(__dirname, "db-schema.sql"), "utf-8");
  assert.match(
    schema,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_token_tx_stripe_ev\s+ON token_transactions \(stripe_event_id\)\s+WHERE stripe_event_id IS NOT NULL/i,
  );

  const migrationPath = path.join(
    __dirname,
    "migrations",
    "007_unique_stripe_event_tokens.sql",
  );
  assert.equal(fs.existsSync(migrationPath), true);

  const migration = fs.readFileSync(migrationPath, "utf-8");
  assert.match(
    migration,
    /ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION BY stripe_event_id/i,
  );
  assert.match(migration, /DROP INDEX IF EXISTS idx_token_tx_stripe_ev/i);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_token_tx_stripe_ev\s+ON token_transactions \(stripe_event_id\)\s+WHERE stripe_event_id IS NOT NULL/is,
  );
});

test("duplicate Stripe credit event unique violations are idempotent", async () => {
  const dbTokens = await import("./db-tokens.js");
  assert.equal(typeof dbTokens.isDuplicateStripeCreditEventError, "function");

  assert.equal(
    dbTokens.isDuplicateStripeCreditEventError({
      code: "23505",
      constraint: "idx_token_tx_stripe_ev",
    }),
    true,
  );
  assert.equal(
    dbTokens.isDuplicateStripeCreditEventError({
      code: "23505",
      constraint: "token_transactions_pkey",
    }),
    false,
  );
});
