import test from "node:test";
import assert from "node:assert/strict";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";

const { app } = await import("../server.js");
const request = supertest(app);

test("GET /api/catalog/midi returns searchable catalog entries", async () => {
  const res = await request.get("/api/catalog/midi?genre=rock&limit=5").expect(200);

  assert.ok(Array.isArray(res.body.entries));
  assert.ok(res.body.entries.length >= 1);
  assert.equal(res.body.entries.every((e) => e.category.genre === "rock"), true);
  assert.ok(res.body.total >= 1);
});

test("GET /api/catalog/midi/:id/file serves catalog MIDI when present", async () => {
  const res = await request.get("/api/catalog/midi/midi-002/file").expect(200);
  assert.equal(res.headers["content-type"], "audio/midi");
  assert.ok(res.body.length > 0);
});
