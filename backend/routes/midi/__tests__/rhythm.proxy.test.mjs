import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
process.env.MIDI_SERVICE_API_TOKEN = "midi-service-test-token";

const STYLES_RESPONSE = {
  styles: [{ id: "rock", name: "Rock", default_tempo: 120 }],
  variations: ["fill"],
};

const GENERATE_JSON_RESPONSE = {
  filename: "rhythm_rock_120bpm_4bars.mid",
  midi_base64: "TVRoZA==",
  metadata: { style: "rock" },
};

test("midi rhythm proxy routes", async (t) => {
  let returnInvalidStylesJson = false;

  const midiServiceServer = http.createServer((req, res) => {
    if (req.url === "/rhythm/styles" && req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      if (returnInvalidStylesJson) {
        res.end("{not-json");
        return;
      }
      res.end(JSON.stringify(STYLES_RESPONSE));
      return;
    }

    if (req.url === "/rhythm/generate/json" && req.method === "POST") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(GENERATE_JSON_RESPONSE));
      return;
    }

    if (req.url === "/rhythm/era/generate/json" && req.method === "POST") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(GENERATE_JSON_RESPONSE));
      return;
    }

    if (req.url === "/rhythm/generate/full" && req.method === "POST") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(GENERATE_JSON_RESPONSE));
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise((resolve) => midiServiceServer.listen(0, "127.0.0.1", resolve));
  process.env.MIDI_SERVICE_URL = `http://127.0.0.1:${midiServiceServer.address().port}`;

  const { app } = await import("../../../server.js");
  const request = supertest(app);
  app.locals.verifyClerkBearer = async () => "user_rhythm_test";

  await t.test("GET /api/midi/rhythm/styles proxies groove list", async () => {
    const res = await request.get("/api/midi/rhythm/styles").expect(200);
    assert.deepEqual(res.body, STYLES_RESPONSE);
  });

  await t.test("POST /api/midi/rhythm/generate/json proxies rhythm payload", async () => {
    const res = await request
      .post("/api/midi/rhythm/generate/json")
      .send({ style: "rock", bars: 4, tempo: 120 })
      .expect(200);

    assert.equal(res.body.filename, GENERATE_JSON_RESPONSE.filename);
    assert.equal(res.body.midi_base64, GENERATE_JSON_RESPONSE.midi_base64);
  });

  await t.test("POST /api/midi/rhythm/era/generate/json proxies era payload", async () => {
    const res = await request
      .post("/api/midi/rhythm/era/generate/json")
      .send({ style: "rock", bars: 4, tempo: 120, era: "80s" })
      .expect(200);

    assert.equal(res.body.filename, GENERATE_JSON_RESPONSE.filename);
  });

  await t.test("POST /api/midi/rhythm/generate/full proxies full arrangement", async () => {
    const res = await request
      .post("/api/midi/rhythm/generate/full")
      .send({ style: "rock", bars: 8, tempo: 120 })
      .expect(200);

    assert.equal(res.body.midi_base64, GENERATE_JSON_RESPONSE.midi_base64);
  });

  await t.test("GET /api/midi/rhythm/styles returns 502 on invalid upstream JSON", async () => {
    returnInvalidStylesJson = true;
    const res = await request.get("/api/midi/rhythm/styles").expect(502);
    assert.match(res.body.error, /Invalid JSON/i);
    returnInvalidStylesJson = false;
  });

  t.after(async () => {
    await new Promise((resolve, reject) =>
      midiServiceServer.close((err) => (err ? reject(err) : resolve())),
    );
  });
});
