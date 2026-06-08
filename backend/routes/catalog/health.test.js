import test from "node:test";
import assert from "node:assert/strict";

import express from "express";
import supertest from "supertest";

import { catalogRouter } from "./index.js";

function buildRequest() {
  const app = express();
  app.use("/api/catalog", catalogRouter);
  return supertest(app);
}

test("GET /api/catalog/midi/health returns operator-friendly catalog health", async () => {
  const request = buildRequest();
  let req = request.get("/api/catalog/midi/health");
  if (process.env.API_KEY) {
    req = req.set("x-api-key", process.env.API_KEY);
  }
  const res = await req.expect(200);

  assert.ok(["ok", "degraded"].includes(res.body.status));
  assert.equal(typeof res.body.total_entries, "number");
  assert.equal(typeof res.body.valid_files, "number");
  assert.equal(typeof res.body.issue_count, "number");
  assert.ok(Array.isArray(res.body.issues));
  assert.equal(typeof res.body.index_path, "string");
  assert.equal(typeof res.body.files_dir, "string");
});
