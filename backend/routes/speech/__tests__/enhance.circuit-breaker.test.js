// @ts-check
/**
 * Property test: CircuitOpenError → 503 for the speech enhance route.
 *
 * **Validates: Requirements 3.2**
 *
 * Property 1: For any CircuitOpenError thrown by speechServiceClient.breaker.call,
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
process.env.DATABASE_URL = "";
process.env.REDIS_URL = "";
process.env.DEV_BYPASS_UPLOAD_AUTH = "1";
process.env.SPEECH_SERVICE_URL = "http://127.0.0.1:59998"; // unreachable — breaker.call is mocked
process.env.USAGE_TOKENS_ENABLED = "0";
process.env.RATE_LIMIT_MAX_REQUESTS = "10000";

// Create a temp upload directory so multer has somewhere to write
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "burntbeats-enhance-cb-"),
);
const uploadDir = path.join(tempRoot, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
process.env.UPLOAD_TMP_DIR = uploadDir;

// Import the app and serviceClients AFTER env vars are set
// NOTE: speechServiceClient is a module-level singleton. The monkey-patch pattern
// below is safe because node --test runs each file in its own child process.
// If test isolation changes, these tests would need per-request injection instead.
const { app } = await import("../../../server.js");
const { speechServiceClient, CircuitOpenError } = await import(
  "../../../lib/serviceClients.js"
);

const request = supertest(app);

// Enable trust proxy so X-Forwarded-For sets req.ip (used by rate limiter)
app.set("trust proxy", true);

// Bypass Clerk auth — return a stable user ID
app.locals.verifyClerkBearer = async () => "user_cb_enhance_test";

// ── Helper: minimal valid WAV buffer (1KB, structurally complete) ──────────────
function minimalWavBuffer() {
  const dataSize = 960; // enough PCM silence to be structurally valid
  const b = Buffer.alloc(44 + dataSize);
  // RIFF header
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + dataSize, 4);
  b.write("WAVE", 8);
  // fmt sub-chunk
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);         // PCM
  b.writeUInt16LE(1, 22);         // mono
  b.writeUInt32LE(44100, 24);     // sample rate
  b.writeUInt32LE(88200, 28);     // byte rate
  b.writeUInt16LE(2, 32);         // block align
  b.writeUInt16LE(16, 34);        // bits per sample
  // data sub-chunk (zeros = silence)
  b.write("data", 36);
  b.writeUInt32LE(dataSize, 40);
  return b;
}

// ------------------------------------------------------------------
// Property 1: CircuitOpenError → canonical 503 response
// ------------------------------------------------------------------
test("enhance.js — Property 1: CircuitOpenError → canonical 503", { timeout: 90_000 }, async () => {
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
        const originalCall = speechServiceClient.breaker.call.bind(
          speechServiceClient.breaker,
        );
        speechServiceClient.breaker.call = async (_fn) => {
          throw new CircuitOpenError("speech_service", retryAfter * 1000);
        };

        try {
          const res = await request
            .post("/api/speech/enhance")
            .set("X-Forwarded-For", ip)
            .field("denoise", "true")
            .field("batch", "false")
            .attach("file", minimalWavBuffer(), "sample.wav");

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
          speechServiceClient.breaker.call = originalCall;
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
