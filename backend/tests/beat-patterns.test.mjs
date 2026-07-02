import test from "node:test";
import assert from "node:assert/strict";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";

const patterns = new Map();

const { app } = await import("../server.js");

app.locals.verifyClerkBearer = async (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader === "Bearer token-owner") return "user-owner";
  throw Object.assign(new Error("Missing auth token"), { status: 401 });
};

app.locals.beatPatternDb = {
  listBeatPatterns: async (userId) =>
    [...patterns.values()].filter((p) => p.clerk_user_id === userId),
  createBeatPattern: async (userId, payload) => {
    const row = {
      id: `pat-${patterns.size + 1}`,
      clerk_user_id: userId,
      name: payload.name,
      preset: payload.preset,
      tags: payload.tags ?? [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    patterns.set(row.id, row);
    return row;
  },
  updateBeatPattern: async (userId, id, payload) => {
    const existing = patterns.get(id);
    if (!existing || existing.clerk_user_id !== userId) return null;
    const row = {
      ...existing,
      name: payload.name ?? existing.name,
      preset: payload.preset ?? existing.preset,
      tags: payload.tags ?? existing.tags,
      updated_at: new Date().toISOString(),
    };
    patterns.set(id, row);
    return row;
  },
  deleteBeatPattern: async (userId, id) => {
    const existing = patterns.get(id);
    if (!existing || existing.clerk_user_id !== userId) return false;
    patterns.delete(id);
    return true;
  },
};

const request = supertest(app);

test("GET /api/beat-patterns requires auth", async () => {
  await request.get("/api/beat-patterns").expect(401);
});

test("POST and GET /api/beat-patterns round-trip for owner", async () => {
  const preset = {
    name: "Test",
    pattern: [[0, 100]],
    bpm: 120,
    steps: 16,
  };

  const createRes = await request
    .post("/api/beat-patterns")
    .set("Authorization", "Bearer token-owner")
    .send({ name: "My Beat", preset, tags: ["test"] })
    .expect(201);

  assert.equal(createRes.body.pattern.name, "My Beat");

  const listRes = await request
    .get("/api/beat-patterns")
    .set("Authorization", "Bearer token-owner")
    .expect(200);

  assert.equal(listRes.body.patterns.length, 1);
  assert.equal(listRes.body.patterns[0].name, "My Beat");
});

test("PUT and DELETE /api/beat-patterns/:id", async () => {
  const preset = { name: "X", pattern: [[100]], bpm: 90, steps: 16 };
  const createRes = await request
    .post("/api/beat-patterns")
    .set("Authorization", "Bearer token-owner")
    .send({ name: "Rename Me", preset })
    .expect(201);

  const id = createRes.body.pattern.id;

  const updateRes = await request
    .put(`/api/beat-patterns/${id}`)
    .set("Authorization", "Bearer token-owner")
    .send({ name: "Renamed" })
    .expect(200);

  assert.equal(updateRes.body.pattern.name, "Renamed");

  await request
    .delete(`/api/beat-patterns/${id}`)
    .set("Authorization", "Bearer token-owner")
    .expect(204);
});
