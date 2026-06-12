// @ts-check
/**
 * Property-Based Test — Property 1: CircuitOpenError produces canonical 503 response
 *
 * **Validates: Requirements 3.2**
 *
 * For any CircuitOpenError thrown by speechServiceClient.breaker.call in the enhance route,
 * the HTTP response SHALL have:
 *   - status 503
 *   - Retry-After header equal to String(retryAfter)
 *   - JSON body with a non-empty "error" string
 *
 * Tag: Feature: sre-reliability-wiring, Property 1: CircuitOpenError produces canonical 503 response
 */

import { describe, it, vi, beforeAll } from "vitest";
import { expect } from "vitest";
import fc from "fast-check";
import supertest from "supertest";
import express from "express";

// ── Environment setup (before any module imports) ─────────────────────────────
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.API_KEY = "test-key";
process.env.JOB_TOKEN_SECRET = "";
process.env.DEV_BYPASS_UPLOAD_AUTH = "1";
process.env.SPEECH_SERVICE_URL = "http://127.0.0.1:59998"; // unreachable — breaker.call is mocked
process.env.USAGE_TOKENS_ENABLED = "0"; // disable usage token checks

// ── Mock dependencies before the route is imported ───────────────────────────
// Paths are relative to this test file: backend/routes/speech/__tests__/

// speechServiceClient — the breaker.call mock is the heart of this test
vi.mock("../../../lib/serviceClients.js", async (importOriginal) => {
  const original = /** @type {any} */ (await importOriginal());
  return {
    ...original,
    speechServiceClient: {
      breaker: {
        call: vi.fn(),
      },
    },
  };
});

// Skip malware scanning (no ClamAV in test env)
vi.mock("../../../malwareScan.js", () => ({
  scanUploadedFile: vi.fn().mockResolvedValue({ ok: true }),
}));

// Skip extension/magic-bytes sniff
vi.mock("../../../uploadSniff.js", () => ({
  verifyUploadMatchesExtension: vi.fn().mockReturnValue({ ok: true }),
}));

// Skip DB writes
vi.mock("../../../db-jobs.js", () => ({
  insertJob: vi.fn().mockResolvedValue(undefined),
  updateJobStatus: vi.fn().mockResolvedValue(undefined),
}));

// Skip Redis/Stripe client initialisation
vi.mock("../../../stripeRedis.js", () => ({
  getRedis: vi.fn().mockResolvedValue(null),
}));

// Disable usage tokens so the route skips token reservation before breaker.call
vi.mock("../../../usageTokens.js", () => ({
  isUsageTokensEnabled: vi.fn().mockReturnValue(false),
  getAudioDurationSeconds: vi.fn().mockResolvedValue(10),
  computeSplitCost: vi.fn().mockReturnValue(0),
  reserveUsageTokens: vi.fn().mockResolvedValue(undefined),
  refundUsageTokens: vi.fn().mockResolvedValue(undefined),
}));

// ── Build a minimal Express app from just the enhance router ──────────────────
// We do NOT import the full server.js to avoid DB/Redis connection side-effects.

let testApp;
let breakerCallMock;

beforeAll(async () => {
  // Import the mocked serviceClients to get a handle on the mock function
  const { speechServiceClient } = await import("../../../lib/serviceClients.js");
  breakerCallMock = speechServiceClient.breaker.call;

  // Import the route (mocks are already registered above)
  const { enhanceRouter } = await import("../enhance.js");

  testApp = express();
  testApp.use(express.json());
  // Mount under /api/speech/enhance — same as the real server
  testApp.use("/api/speech/enhance", enhanceRouter);
});

// ── Helper: minimal valid WAV buffer ──────────────────────────────────────────
function minimalWavBuffer() {
  const b = Buffer.alloc(44);
  // RIFF header
  b.write("RIFF", 0);
  b.writeUInt32LE(36, 4);         // chunk size
  b.write("WAVE", 8);
  // fmt sub-chunk
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);        // sub-chunk size (PCM)
  b.writeUInt16LE(1, 20);         // audio format: PCM
  b.writeUInt16LE(1, 22);         // num channels: mono
  b.writeUInt32LE(44100, 24);     // sample rate
  b.writeUInt32LE(88200, 28);     // byte rate
  b.writeUInt16LE(2, 32);         // block align
  b.writeUInt16LE(16, 34);        // bits per sample
  // data sub-chunk
  b.write("data", 36);
  b.writeUInt32LE(0, 40);         // data size (empty PCM data)
  return b;
}

// ── Property 1: CircuitOpenError → canonical 503 response ────────────────────
/**
 * **Validates: Requirements 3.2**
 */
describe("enhance.js — Property 1: CircuitOpenError produces canonical 503 response", () => {
  it(
    "returns 503 with Retry-After and non-empty error body for any retryAfter (1–300s)",
    async () => {
      const { CircuitOpenError } = await import("../../../lib/serviceClients.js");

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 300 }),
          async (retryAfter) => {
            // CircuitOpenError constructor takes resetTimeout in ms;
            // .retryAfter = Math.ceil(resetTimeout / 1000) — so pass retryAfter * 1000
            const err = new CircuitOpenError("speech_service", retryAfter * 1000);

            // Make breaker.call throw the circuit-open error for this iteration
            breakerCallMock.mockRejectedValueOnce(err);

            const res = await supertest(testApp)
              .post("/api/speech/enhance")
              .set("x-api-key", "test-key")
              .field("denoise", "true")
              .field("batch", "false")
              .attach("file", minimalWavBuffer(), {
                filename: "sample.wav",
                contentType: "audio/wav",
              });

            expect(res.status).toBe(503);
            expect(res.headers["retry-after"]).toBe(String(retryAfter));
            expect(typeof res.body.error).toBe("string");
            expect(res.body.error.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    },
    // Generous timeout for 100 async HTTP iterations
    90_000
  );
});
