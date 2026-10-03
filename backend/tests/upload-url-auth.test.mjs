import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.API_KEY = "";
process.env.USAGE_TOKENS_ENABLED = "1";
process.env.DEV_BYPASS_UPLOAD_AUTH = "0";
process.env.S3_UPLOAD_BUCKET = "";

const { uploadUrlRouter } = await import("../routes/stems/upload-url.js");

const app = express();
app.use(express.json());
app.use("/api/stems/upload-url", uploadUrlRouter);

const request = supertest(app);

test("POST /api/stems/upload-url requires Clerk auth before issuing upload capacity", async () => {
  const res = await request
    .post("/api/stems/upload-url")
    .send({ filename: "song.wav", contentType: "audio/wav" })
    .expect(401);

  assert.match(res.body.error, /auth token|Unauthorized/i);
});
