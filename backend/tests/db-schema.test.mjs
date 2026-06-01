/**
 * Schema drift guard: when DATABASE_URL is set, migrations must include jobs.split_intent.
 *
 * Run: node --test backend/tests/db-schema.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  columnExists,
  ensureDatabaseMigrated,
  getTestDatabaseUrl,
  loadBackendEnvForTests,
} from "./db-test-setup.mjs";

loadBackendEnvForTests();

const databaseUrl = getTestDatabaseUrl();
if (!databaseUrl) {
  test("db-schema: SKIPPED (no DATABASE_URL configured)", () => {
    console.log("Skipping db-schema tests — set DATABASE_URL to run them.");
  });
} else {
  process.env.NODE_ENV = "test";

  test("migrations include jobs.split_intent", async () => {
    await ensureDatabaseMigrated();
    const { getPool } = await import("../db.js");
    const pool = getPool();
    assert.ok(pool, "pool should exist when DATABASE_URL is set");
    const exists = await columnExists(pool, "jobs", "split_intent");
    assert.equal(
      exists,
      true,
      "jobs.split_intent missing after migrate — run: cd backend && npm run db:migrate",
    );
  });
}
