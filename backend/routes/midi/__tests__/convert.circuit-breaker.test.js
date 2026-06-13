// @ts-check
/**
 * Property test: CircuitOpenError → 503 for the MIDI convert route.
 *
 * **Validates: Requirements 4.2**
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
// Disable Redis so no unintended side effects
process.env.REDIS_URL = "";
// Disable usage tokens so requireUsageAuthPreUpload passes without Clerk auth
process.env.USAGE_TOKENS_ENABLED = "";
// Raise the global rate limit well above the 100 property runs so it never
// interferes with the circuit-breaker assertion (default is 10/window)
process.env.RATE_LIMIT_MAX_REQUESTS = "10000";

// --- Stem temp directory setup ---
// The convert route resolves stem files from STEM_OUTPUT_DIR.
// We create a minimal WAV stub so resolveStemPath() returns a real path.
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "burntbeats-convert-cb-"),
);
const stemOutputDir = path.join(tempRoot, "stems");
fs.mkdirSync(stemOutputDir, { recursive: true });
process.env.STEM_OUTPUT_DIR = stemOutputDir;

const STEM_JOB_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STEM_NAME = "vocals";

// Write a minimal WAV stub under STEM_OUTPUT_DIR/<jobId>/stems/<stemName>.wav
const stemJobDir = path.join(stemOutputDir, STEM_JOB_ID, "stems");
fs.mkdirSync(stemJobDir, { recursive: true });
// Minimal RIFF/WAV header so the file exists (convert bypasses sniff when useStemFile=true)
fs.writeFileSync(
  path.join(stemJobDir, `${STEM_NAME}.wav`),
  Buffer.from("RIFF\x00\x00\x00\x00WAVEfmt "),
);

// Import the app and serviceClients AFTER env vars are set
// NOTE: midiServiceClient is a module-level singleton. The monkey-patch pattern
// below is safe because node --test runs each file in its own child process.
// If test isolation changes, these tests would need per-request injection instead.
const { app } = await import("../../../server.js");
const { midiServiceClient, CircuitOpenError } = await import(
  "../../../lib/serviceClients.js"
);

const request = supertest(app);

// Bypass Clerk auth — return a stable user ID
app.locals.verifyClerkBearer = async () => "user_cb_convert_test";

// ------------------------------------------------------------------
// Property 1: CircuitOpenError → canonical 503 response
// ------------------------------------------------------------------
test("convert.js — Property 1: CircuitOpenError → canonical 503", { timeout: 60_000 }, async () => {
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
        const originalCall = midiServiceClient.breaker.call.bind(
          midiServiceClient.breaker,
        );
        midiServiceClient.breaker.call = async (_fn) => {
          // CircuitOpenError.retryAfter = Math.ceil(resetTimeout / 1000)
          // so pass resetTimeout = retryAfter * 1000 to get the desired retryAfter value
          throw new CircuitOpenError("midi_service", retryAfter * 1000);
        };

        try {
          const res = await request
            .post("/api/midi/convert")
            .set("X-Forwarded-For", ip)
            .field("stem_job_id", STEM_JOB_ID)
            .field("stem_name", STEM_NAME);

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
          midiServiceClient.breaker.call = originalCall;
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
