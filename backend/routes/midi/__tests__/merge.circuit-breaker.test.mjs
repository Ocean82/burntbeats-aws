// @ts-check
/**
 * Property test: CircuitOpenError → 503 for the MIDI merge route.
 *
 * **Validates: Requirements 5.2**
 *
 * Property 1: For any CircuitOpenError thrown by midiServiceClient.breaker.call,
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

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
// Disable Redis so the rate limiter falls back to the memory store
process.env.REDIS_URL = "";

// Set up a temp MIDI output directory so verifyMidiOwner / readMidiJobMetadata work
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "burntbeats-merge-cb-"),
);
const midiOutputDir = path.join(tempRoot, "midi");
fs.mkdirSync(midiOutputDir, { recursive: true });
process.env.MIDI_OUTPUT_DIR = midiOutputDir;

// Valid UUIDs for the merge request body
const JOB_ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "user_cb_test";

// Write minimal metadata so ownership check passes
function writeJobMetadata(jobId) {
  const dir = path.join(midiOutputDir, jobId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "metadata.json"),
    JSON.stringify({ user_id: USER_ID }),
    "utf-8",
  );
}
writeJobMetadata(JOB_ID_A);
writeJobMetadata(JOB_ID_B);

// Import the app and serviceClients AFTER env vars are set
const { app } = await import("../../../server.js");
const { midiServiceClient, CircuitOpenError } = await import(
  "../../../lib/serviceClients.js"
);

const request = supertest(app);

// Enable trust proxy so X-Forwarded-For sets req.ip (used by rate limiter)
app.set("trust proxy", true);

// Mock auth: always return USER_ID
app.locals.verifyClerkBearer = async () => USER_ID;

// ------------------------------------------------------------------
// Property 1: CircuitOpenError → canonical 503 response
// ------------------------------------------------------------------
test("Property 1 — CircuitOpenError produces canonical 503 for any retryAfter value", async () => {
  let runIndex = 0;

  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 300 }),
      async (retryAfter) => {
        // Use a unique IP per run to avoid hitting the rate limit (max 5 req/IP/window).
        // We have 100 runs, so we need 100 unique IPs — use 10.0.X.Y addressing.
        runIndex++;
        const octet3 = Math.floor(runIndex / 255);
        const octet4 = (runIndex % 254) + 1;
        const ip = `10.0.${octet3}.${octet4}`;

        // Inject: make breaker.call throw CircuitOpenError with this retryAfter.
        // CircuitOpenError.retryAfter = Math.ceil(resetTimeout / 1000)
        // so pass resetTimeout = retryAfter * 1000 to get the exact desired value.
        const originalCall = midiServiceClient.breaker.call.bind(
          midiServiceClient.breaker,
        );
        midiServiceClient.breaker.call = async (_fn) => {
          throw new CircuitOpenError("midi_service", retryAfter * 1000);
        };

        try {
          const res = await request
            .post("/api/midi/merge")
            .set("X-Forwarded-For", ip)
            .send({
              jobs: [
                { job_id: JOB_ID_A, stem_name: "vocals" },
                { job_id: JOB_ID_B, stem_name: "drums" },
              ],
            });

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

          // Body must have an "error" string field
          assert.ok(
            res.body &&
              typeof res.body.error === "string" &&
              res.body.error.length > 0,
            `Expected non-empty error string in body, got: ${JSON.stringify(res.body)}`,
          );
        } finally {
          // Always restore the original call
          midiServiceClient.breaker.call = originalCall;
        }
      },
    ),
    { numRuns: 100 },
  );
});

test.after(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});
