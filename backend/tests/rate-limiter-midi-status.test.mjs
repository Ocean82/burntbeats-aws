import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { shouldSkipGlobalRateLimit } = await import("../middleware/rateLimiter.js");

test("global rate limiter skips high-frequency MIDI status polling", () => {
  assert.equal(
    shouldSkipGlobalRateLimit({
      method: "GET",
      path: "/api/midi/status/90e30e28-c015-41f5-80d3-71f7a26d709e",
    }),
    true,
  );
});

test("global rate limiter still applies to non-polling MIDI routes", () => {
  assert.equal(
    shouldSkipGlobalRateLimit({
      method: "POST",
      path: "/api/midi/convert",
    }),
    false,
  );
});
