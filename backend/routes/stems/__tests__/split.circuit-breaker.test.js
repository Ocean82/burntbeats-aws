// @ts-check
/**
 * Property-Based Test — Property 1: CircuitOpenError produces canonical 503 response
 *
 * Validates: Requirements 1.2
 *
 * For any CircuitOpenError thrown by stemServiceClient.breaker.call in the split route,
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
process.env.TEST_BYPASS_PREMIUM_ENTITLEMENTS = "1";
process.env.STEM_SERVICE_URL = "http://127.0.0.1:59999"; // unreachable — breaker.call is mocked
process.env.RATE_LIMIT_MAX_REQUESTS = "10000";

// ── Mock dependencies before the route is imported ───────────────────────────
// Paths are relative to this test file: backend/routes/stems/__tests__/

// stemServiceClient — the breaker.call mock is the heart of this test
vi.mock("../../../lib/serviceClients.js", async (importOriginal) => {
  const original = /** @type {any} */ (await importOriginal());
  return {
    ...original,
    stemServiceClient: {
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

// ── Build a minimal Express app from just the split router ────────────────────
// We do NOT import the full server.js to avoid DB/Redis connection side-effects.

let testApp;
let breakerCallMock;

beforeAll(async () => {
  // Import the mocked serviceClients to get a handle on the mock function
  const { stemServiceClient } = await import("../../../lib/serviceClients.js");
  breakerCallMock = stemServiceClient.breaker.call;

  // Import the route (mocks are already registered above)
  const { splitRouter } = await import("../split.js");

  testApp = express();
  testApp.use(express.json());
  // Mount under /api/stems/split — same as the real server
  testApp.use("/api/stems/split", splitRouter);
});

// ── Helper: minimal valid WAV buffer ──────────────────────────────────────────
function minimalWavBuffer() {
  const b = Buffer.alloc(12);
  b.write("RIFF", 0);
  b.writeUInt32LE(100, 4);
  b.write("WAVE", 8);
  return b;
}

// ── Property 1: CircuitOpenError → canonical 503 response ────────────────────
/**
 * **Validates: Requirements 1.2**
 */
describe("split.js — Property 1: CircuitOpenError produces canonical 503 response", () => {
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
            const err = new CircuitOpenError("stem_service", retryAfter * 1000);

            // Make breaker.call throw the circuit-open error this iteration
            breakerCallMock.mockRejectedValueOnce(err);

            const res = await supertest(testApp)
              .post("/api/stems/split")
              .set("x-api-key", "test-key")
              .field("stems", "2")
              .attach("file", minimalWavBuffer(), "sample.wav");

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
