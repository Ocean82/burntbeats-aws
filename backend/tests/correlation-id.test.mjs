/**
 * Integration test: correlation ID propagation.
 *
 * Verifies that X-Correlation-ID flows from the incoming Express request
 * through to the downstream stem service proxy.
 *
 * Run:
 *   node --test backend/tests/correlation-id.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";

// ── Environment setup (must happen before imports) ──────────────────────────
process.env.NODE_ENV = "test";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
process.env.BACKEND_SKIP_START = "1";
process.env.DATABASE_URL = "";
process.env.REDIS_URL = "";
process.env.DEV_BYPASS_UPLOAD_AUTH = "1";
process.env.USAGE_TOKENS_ENABLED = "0";
process.env.RATE_LIMIT_MAX_REQUESTS = "10000";
process.env.TEST_BYPASS_PREMIUM_ENTITLEMENTS = "1";

// Temp directories for multer and stem output
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "burntbeats-corr-id-"),
);
const uploadDir = path.join(tempRoot, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
process.env.UPLOAD_TMP_DIR = uploadDir;

const stemOutputDir = path.join(tempRoot, "stems");
fs.mkdirSync(stemOutputDir, { recursive: true });
process.env.STEM_OUTPUT_DIR = stemOutputDir;

// ── Local stem-service mock ──────────────────────────────────────────────────
const capturedRequests = new Map();

const mockServer = http.createServer((req, res) => {
  capturedRequests.set(req.url, {
    headers: { ...req.headers },
    method: req.method,
  });
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      job_id: randomUUID(),
      status: "queued",
      progress: { percent: 0 },
    }),
  );
});

await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
const mockPort = mockServer.address().port;
process.env.STEM_SERVICE_URL = `http://127.0.0.1:${mockPort}`;

// ── Import app and dependencies AFTER env is set ─────────────────────────────
import supertest from "supertest";

const { app } = await import("../server.js");

const request = supertest(app);

// Bypass Clerk auth — return a stable user ID
app.set("trust proxy", true);
app.locals.verifyClerkBearer = async () => "user_corr_id_test";

// ── Helper: minimal valid WAV buffer ─────────────────────────────────────────
function minimalWavBuffer() {
  const dataSize = 960;
  const b = new Uint8Array(44 + dataSize);
  const view = new DataView(b.buffer);
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46); // RIFF
  view.setUint32(4, 36 + dataSize, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45); // WAVE
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 88200, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61); // data
  view.setUint32(40, dataSize, true);
  return b;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("POST /api/stems/split echoes X-Correlation-ID in response", async () => {
  const correlationId = `test-cid-${randomUUID()}`;

  const res = await request
    .post("/api/stems/split")
    .set("X-Correlation-ID", correlationId)
    .field("stems", "2")
    .attach("file", Buffer.from(minimalWavBuffer()), "sample.wav");

  assert.equal(res.status, 202, `Expected 202, got ${res.status}`);
  assert.equal(
    res.headers["x-correlation-id"],
    correlationId,
    `Expected response X-Correlation-ID to match request: ${correlationId}`,
  );
});

test("POST /api/stems/split forwards X-Correlation-ID to stem service", async () => {
  const correlationId = `test-cid-forward-${randomUUID()}`;
  capturedRequests.clear();

  await request
    .post("/api/stems/split")
    .set("X-Correlation-ID", correlationId)
    .field("stems", "2")
    .attach("file", Buffer.from(minimalWavBuffer()), "sample.wav");

  // Find the captured request to the /split endpoint
  let match = null;
  for (const [url, data] of capturedRequests.entries()) {
    if (url.includes("/split")) {
      match = data;
      break;
    }
  }

  assert.ok(match, "Expected a request to /split on the stem service");
  assert.equal(
    match.headers["x-correlation-id"],
    correlationId,
    `Expected forwarded X-Correlation-ID to match request: ${correlationId}`,
  );
});

test("generates correlation ID when header is absent", async () => {
  const res = await request
    .post("/api/stems/split")
    .field("stems", "2")
    .attach("file", Buffer.from(minimalWavBuffer()), "sample.wav");

  assert.equal(res.status, 202);
  const cid = res.headers["x-correlation-id"];
  assert.ok(cid && cid.length > 0, "Expected non-empty X-Correlation-ID in response");
  // Should be a UUID (generated by the middleware)
  assert.ok(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid),
    `Expected X-Correlation-ID to be a UUID, got: ${cid}`,
  );
});

// ── Cleanup ──────────────────────────────────────────────────────────────────
test.after(async () => {
  mockServer.close();
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});
