import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.API_KEY = "test-key";

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

