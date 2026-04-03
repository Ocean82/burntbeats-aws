import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import http from "http";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.API_KEY = "test-key";
process.env.JOB_TOKEN_SECRET = ""; // disable job token auth for these basic tests
process.env.STEM_SERVICE_API_TOKEN = "stem-service-test-token";

/** @type {string | undefined} */
let lastStemServiceTokenHeader;
const mockStemService = http.createServer((req, res) => {
  if (req.url === "/split" && req.method === "POST") {
    lastStemServiceTokenHeader = req.headers["x-stem-service-token"];
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = 202;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ job_id: randomUUID(), status: "accepted" }));
    });
    return;
  }
  if (req.url === "/expand" && req.method === "POST") {
    lastStemServiceTokenHeader = req.headers["x-stem-service-token"];
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = 202;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ job_id: randomUUID(), status: "accepted" }));
    });
    return;
  }
  if (req.url && req.url.startsWith("/split/") && req.method === "DELETE") {
    lastStemServiceTokenHeader = req.headers["x-stem-service-token"];
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ deleted: true }));
    });
    return;
  }
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ detail: "not found" }));
});

await new Promise((resolve) => mockStemService.listen(0, "127.0.0.1", resolve));
const addr = mockStemService.address();
if (!addr || typeof addr === "string") {
  throw new Error("Failed to start mock stem service");
}
process.env.STEM_SERVICE_URL = `http://127.0.0.1:${addr.port}`;

const { app } = await import("./server.js");
const request = supertest(app);

test("GET /api/health returns ok", async () => {
  const res = await request.get("/api/health").expect(200);
  assert.equal(res.body.status, "ok");
});

test("GET /api/stems/status invalid job_id returns 400", async () => {
  const res = await request
    .get("/api/stems/status/not-a-uuid")
    .set("x-api-key", process.env.API_KEY)
    .expect(400);
  assert.ok(typeof res.body.error === "string");
});

test("GET /api/stems/status requires x-api-key when API_KEY is set", async () => {
  const jobId = randomUUID();
  await request.get(`/api/stems/status/${jobId}`).expect(401);
});

test("GET /api/stems/file validates stemId before serving", async () => {
  const jobId = randomUUID();
  const res = await request
    .get(`/api/stems/file/${jobId}/badstem`)
    .set("x-api-key", process.env.API_KEY)
    .expect(400);
  assert.ok(typeof res.body.error === "string");
});

function minimalWavBuffer() {
  const b = Buffer.alloc(12);
  b.write("RIFF", 0);
  b.writeUInt32LE(100, 4);
  b.write("WAVE", 8);
  return b;
}

test("POST /api/stems/split forwards X-Stem-Service-Token to stem service", async () => {
  lastStemServiceTokenHeader = undefined;
  const res = await request
    .post("/api/stems/split")
    .set("x-api-key", process.env.API_KEY)
    .field("stems", "2")
    .attach("file", minimalWavBuffer(), "sample.wav")
    .expect(202);

  assert.equal(typeof res.body.job_id, "string");
  assert.equal(lastStemServiceTokenHeader, process.env.STEM_SERVICE_API_TOKEN);
});

test("POST /api/stems/expand forwards X-Stem-Service-Token to stem service", async () => {
  lastStemServiceTokenHeader = undefined;
  const res = await request
    .post("/api/stems/expand")
    .set("x-api-key", process.env.API_KEY)
    .send({ job_id: randomUUID(), quality: "quality" })
    .expect(202);

  assert.equal(typeof res.body.job_id, "string");
  assert.equal(lastStemServiceTokenHeader, process.env.STEM_SERVICE_API_TOKEN);
});

test("DELETE /api/stems/:job_id forwards X-Stem-Service-Token to stem service", async () => {
  lastStemServiceTokenHeader = undefined;
  const res = await request
    .delete(`/api/stems/${randomUUID()}`)
    .set("x-api-key", process.env.API_KEY)
    .expect(200);

  assert.equal(res.body.deleted, true);
  assert.equal(lastStemServiceTokenHeader, process.env.STEM_SERVICE_API_TOKEN);
});

test("GET /api/stems/cleanup is rejected; POST remains the supported method", async () => {
  const getRes = await request
    .get("/api/stems/cleanup")
    .set("x-api-key", process.env.API_KEY)
    .expect(405);
  assert.equal(typeof getRes.body.error, "string");

  const postRes = await request
    .post("/api/stems/cleanup")
    .set("x-api-key", process.env.API_KEY)
    .expect(200);
  assert.equal(typeof postRes.body.deleted, "number");
});

test("GET /api/billing/balance route exists (compat alias)", async () => {
  // Route should exist and require auth, not return 404.
  await request.get("/api/billing/balance").expect(401);
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    mockStemService.close((err) => (err ? reject(err) : resolve()));
  });
});

