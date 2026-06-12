/**
 * Property-Based Tests: CircuitOpenError produces canonical 503 response (expand route)
 *
 * Feature: sre-reliability-wiring
 * Property 1: CircuitOpenError produces canonical 503 response
 *
 * For any CircuitOpenError thrown by stemServiceClient in the expand route handler,
 * the HTTP response SHALL have:
 *   - status === 503
 *   - Retry-After header === String(error.retryAfter)
 *   - JSON body with a non-empty "error" string
 *
 * **Validates: Requirements 2.2**
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import express from "express";
import supertest from "supertest";
import { randomUUID } from "crypto";

// ── Mocks ──────────────────────────────────────────────────────────────────────
// vi.mock paths are relative to this test file.
// expand.js lives one level up; its imports are relative to expand.js.
// We mock by the path as seen from this test file.
//
// IMPORTANT: The same CircuitOpenError class must be used by both the mock
// module (so expand.js can do `e instanceof CircuitOpenError`) and the test
// (so we can construct the error to throw). We achieve this by importing the
// *real* CircuitOpenError from the actual circuitBreaker.js (not the mocked
// serviceClients.js) and using it in both places.

vi.mock("../../../lib/serviceClients.js", async (importOriginal) => {
  // Import the real CircuitOpenError so instanceof checks work in expand.js
  const real = await importOriginal();
  return {
    stemServiceClient: {
      breaker: {
        call: vi.fn(),
      },
    },
    CircuitOpenError: real.CircuitOpenError,
  };
});

// Mock entitlements so requireExpandEntitlements always passes through
vi.mock("../entitlements.js", () => ({
  requireExpandEntitlements: vi.fn().mockResolvedValue({
    ok: true,
    userId: "test-user",
    entitlements: {
      plan: "premium",
      entitlementSource: "subscription",
      capabilities: {
        canSplitFourStems: true,
        canExpandToFourStems: true,
        canUsePremiumStemQualities: true,
        canUseBatchQueue: true,
      },
    },
  }),
}));

// Mock usageTokens so isUsageTokensEnabled returns false (skip usage token checks)
vi.mock("../../../usageTokens.js", () => ({
  isUsageTokensEnabled: vi.fn().mockReturnValue(false),
  computeExpandCost: vi.fn().mockReturnValue(0),
  getAudioDurationSeconds: vi.fn().mockResolvedValue(0),
  reserveUsageTokens: vi.fn().mockResolvedValue(undefined),
  refundUsageTokens: vi.fn().mockResolvedValue(undefined),
}));

// ── Import route and mocked modules after mocks are registered ────────────────

const { expandRouter } = await import("../expand.js");
const { stemServiceClient, CircuitOpenError } = await import("../../../lib/serviceClients.js");

// ── Test helpers ───────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app with the expand router mounted.
 * authMiddleware and jobTokenMiddleware pass through when API_KEY and
 * JOB_TOKEN_SECRET env vars are unset (the default in test environments).
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/stems/expand", expandRouter);
  return app;
}

// ── Property 1: CircuitOpenError → 503 ────────────────────────────────────────

describe(
  "Feature: sre-reliability-wiring, Property 1: CircuitOpenError produces canonical 503 response (expand route)",
  () => {
    const app = buildApp();
    const agent = supertest(app);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it(
      "for any retryAfter (1–300), returns 503 + Retry-After header + non-empty error body",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 300 }),
            async (retryAfter) => {
              // CircuitOpenError constructor: (serviceName, resetTimeoutMs)
              // It sets this.retryAfter = Math.ceil(resetTimeoutMs / 1000)
              // So passing retryAfter * 1000 ensures error.retryAfter === retryAfter
              stemServiceClient.breaker.call.mockRejectedValueOnce(
                new CircuitOpenError("stem_service", retryAfter * 1000),
              );

              const res = await agent
                .post("/api/stems/expand")
                .send({ job_id: randomUUID(), quality: "balanced" });

              expect(res.status).toBe(503);
              expect(res.headers["retry-after"]).toBe(String(retryAfter));
              expect(typeof res.body.error).toBe("string");
              expect(res.body.error.length).toBeGreaterThan(0);
            },
          ),
          { numRuns: 100 },
        );
      },
    );
  },
);
