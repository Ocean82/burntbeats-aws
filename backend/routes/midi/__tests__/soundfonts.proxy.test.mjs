import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
process.env.MIDI_SERVICE_API_TOKEN = "midi-service-test-token";

const SOUNDFONTS_RESPONSE = {
  soundfonts: [
    { id: "general", label: "General MIDI", path: "/soundfonts/GeneralUser.sf2" },
  ],
};

test("midi soundfonts proxy routes", async (t) => {
  let returnInvalidJson = false;

  const midiServiceServer = http.createServer((req, res) => {
    if (req.url === "/soundfonts" && req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      if (returnInvalidJson) {
        res.end("not-json{{{");
        return;
      }
      res.end(JSON.stringify(SOUNDFONTS_RESPONSE));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise((resolve) => midiServiceServer.listen(0, "127.0.0.1", resolve));
  process.env.MIDI_SERVICE_URL = `http://127.0.0.1:${midiServiceServer.address().port}`;

  const { app } = await import("../../../server.js");
  const request = supertest(app);
  app.locals.verifyClerkBearer = async () => "user_soundfonts_test";

  await t.test("GET /api/midi/soundfonts proxies soundfont list", async () => {
    const res = await request.get("/api/midi/soundfonts").expect(200);
    assert.deepEqual(res.body, SOUNDFONTS_RESPONSE);
  });

  await t.test("GET /api/midi/soundfonts returns 502 on invalid upstream JSON", async () => {
    returnInvalidJson = true;
    const res = await request.get("/api/midi/soundfonts").expect(502);
    assert.match(res.body.error, /Invalid JSON/i);
    returnInvalidJson = false;
  });

  t.after(async () => {
    await new Promise((resolve, reject) =>
      midiServiceServer.close((err) => (err ? reject(err) : resolve())),
    );
  });
});
