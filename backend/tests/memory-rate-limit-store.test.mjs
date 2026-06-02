import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { createMemoryRateLimitStore } = await import(
  "../lib/memoryRateLimitStore.js"
);

test("memory rate limit store allows requests under max", () => {
  const store = createMemoryRateLimitStore({ maxEntries: 100 });
  const r1 = store.check("a", 60_000, 3);
  assert.equal(r1.allowed, true);
  const r2 = store.check("a", 60_000, 3);
  assert.equal(r2.allowed, true);
  const r3 = store.check("a", 60_000, 3);
  assert.equal(r3.allowed, true);
  const r4 = store.check("a", 60_000, 3);
  assert.equal(r4.allowed, false);
  assert.ok(r4.retryAfterSec >= 1);
});

test("memory rate limit store evicts when over max entries", () => {
  const store = createMemoryRateLimitStore({ maxEntries: 2 });
  store.check("k1", 60_000, 100);
  store.check("k2", 60_000, 100);
  store.check("k3", 60_000, 100);
  const again = store.check("k1", 60_000, 100);
  assert.equal(again.allowed, true);
});
