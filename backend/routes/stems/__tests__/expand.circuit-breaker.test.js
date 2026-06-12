// @ts-check
/**
 * Property test: CircuitOpenError → 503 for the stems expand route.
 *
 * **Validates: Requirements 2.2**
 *
 * Property 1: For any CircuitOpenError thrown by stemServiceClient.breaker.call,
 * the route MUST respond with status 503, a Retry-After header equal to
 * String(error.retryAfter), and a JSON body containing an "error" string.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import supertest from "supertest";
import fc from "fast-check";
import { randomUUID } from "crypto";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
process.env.DATABASE_URL = "";
process.env.REDIS_URL = "";
process.env.DEV_BYPASS_UPLOAD_AUTH = "1";
process.env.STEM_SERVICE_URL = "http://127.0.0.1:59999"; // unreachable — breaker.call is mocked
process.env.USAGE_TOKENS_ENABLED = "0";
process.env.RATE_LIMIT_MAX_REQUESTS = "10000";
process.env.TEST_BYPASS_EXPAND_ENTITLEMENTS = "1";

// Create a temp directory
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "burntbeats-expand-cb-"),
);
const stemOutputDir = path.join(tempRoot, "stems");
fs.mkdirSync(stemOutputDir, { recursive: true });
process.env.STEM_OUTPUT_DIR = stemOutputDir;

// Import the app and serviceClients AFTER env vars are set
// NOTE: stemServiceClient is a module-level singleton. The monkey-patch pattern
// below is safe because node --test runs each file in its own child process.
// If test isolation changes, these tests would need per-request injection instead.
const { app } = await import("../../../server.js");
const { stemServiceClient, CircuitOpenError } = await import(
  "../../../lib/serviceClients.js"
);

// Enable trust proxy so X-Forwarded-For sets req.ip (used by rate limiter)
app.set("trust proxy", true);

const request = supertest(app);

// ------------------------------------------------------------------
// Property 1: CircuitOpenError → canonical 503 response
// ------------------------------------------------------------------
test("expand.js — Property 1: CircuitOpenError → canonical 503", { timeout: 90_000 }, async () => {
  let runIndex = 0;

  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 300 }),
      async (retryAfter) => {
        runIndex++;
        const octet3 = Math.floor(runIndex / 255);
        const octet4 = (runIndex % 254) + 1;
        const ip = `10.0.${octet3}.${octet4}`;

        // Save and replace breaker.call to throw CircuitOpenError
        const originalCall = stemServiceClient.breaker.call.bind(
          stemServiceClient.breaker,
        );
        stemServiceClient.breaker.call = async (_fn) => {
          throw new CircuitOpenError("stem_service", retryAfter * 1000);
        };

        try {
          const res = await request
            .post("/api/stems/expand")
            .set("X-Forwarded-For", ip)
            .send({ job_id: randomUUID(), quality: "balanced" });

          // Status must be 503
          assert.equal(
            res.status,
            503,
            `Expected 503 for retryAfter=${retryAfter}, got ${res.status}`,
          );

          // Retry-After header must equal String(retryAfter)
          assert.equal(
            res.headers["retry-after"],
            String(retryAfter),
            `Expected Retry-After: ${retryAfter}, got ${res.headers["retry-after"]}`,
          );

          // Body must have a non-empty "error" string field
          assert.ok(
            res.body &&
              typeof res.body.error === "string" &&
              res.body.error.length > 0,
            `Expected non-empty error string in body, got: ${JSON.stringify(res.body)}`,
          );
        } finally {
          // Always restore the original call
          stemServiceClient.breaker.call = originalCall;
        }
      },
    ),
    { numRuns: 100 },
  );
});

// ------------------------------------------------------------------
// Cleanup
// ------------------------------------------------------------------
test.after(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});
