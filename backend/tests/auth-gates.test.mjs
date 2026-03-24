import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";

// Match server.test.js so importing server.js unrefs timers (rate limit prune) and exits cleanly.
process.env.NODE_ENV = "test";

const DUMMY_STEM_BYTES = Buffer.from("RIFF....WAVEfmt ");

function uuidV4Like(id) {
  // Test IDs must match backend UUID regex; these are stable fixed UUIDs.
  return id;
}

function makeProgressPayload(stemId) {
  return {
    status: "completed",
    progress: 100,
    stems: [{ id: stemId, path: `stems/${stemId}.wav` }],
  };
}

async function drainRequest(req) {
  await new Promise((resolve) => {
    req.on("data", () => {});
    req.on("end", () => resolve());
  });
}

test("backend stem API auth gates (job_token)", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-ci-"));
  const stemOutputDir = path.join(tempRoot, "stems");
  fs.mkdirSync(stemOutputDir, { recursive: true });

  const jobId1 = uuidV4Like("11111111-1111-4111-8111-111111111111");
  const jobId2 = uuidV4Like("22222222-2222-4222-8222-222222222222");

  const stemDir1 = path.join(stemOutputDir, jobId1, "stems");
  fs.mkdirSync(stemDir1, { recursive: true });
  fs.writeFileSync(path.join(stemDir1, "vocals.wav"), DUMMY_STEM_BYTES);
  fs.writeFileSync(
    path.join(stemOutputDir, jobId1, "progress.json"),
    JSON.stringify(makeProgressPayload("vocals")),
    "utf-8",
  );

  const stemDir2 = path.join(stemOutputDir, jobId2, "stems");
  fs.mkdirSync(stemDir2, { recursive: true });
  fs.writeFileSync(path.join(stemDir2, "vocals.wav"), DUMMY_STEM_BYTES);
  fs.writeFileSync(
    path.join(stemOutputDir, jobId2, "progress.json"),
    JSON.stringify(makeProgressPayload("vocals")),
    "utf-8",
  );

  const stubApp = express();
  stubApp.post("/split", async (req, res) => {
    await drainRequest(req);
    res.status(202).json({ job_id: jobId1, status: "accepted" });
  });
  stubApp.post("/expand", async (req, res) => {
    await drainRequest(req);
    res.status(202).json({ job_id: jobId2, status: "accepted" });
  });
  stubApp.delete("/split/:job_id", async (req, res) => {
    await drainRequest(req);
    res.status(200).json({ deleted: true });
  });

  const stubServer = await new Promise((resolve) => {
    const s = stubApp.listen(0, "127.0.0.1", () => resolve(s));
  });
  const stubPort = stubServer.address().port;
  const stemServiceUrl = `http://127.0.0.1:${stubPort}`;

  process.env.BACKEND_SKIP_START = "1";
  process.env.STEM_OUTPUT_DIR = stemOutputDir;
  process.env.STEM_SERVICE_URL = stemServiceUrl;
  process.env.API_KEY = ""; // so cleanup requires config
  process.env.JOB_TOKEN_SECRET = "test-job-token-secret";
  process.env.JOB_TOKEN_TTL_MS = "3600000";

  const backendModule = await import("../server.js");
  const { app } = backendModule;

  const backendServer = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const backendPort = backendServer.address().port;
  const backendBaseUrl = `http://127.0.0.1:${backendPort}`;

  try {
    // Unauthorized status/file
    {
      const s = await fetch(`${backendBaseUrl}/api/stems/status/${jobId1}`);
      assert.equal(s.status, 401);

      const f = await fetch(`${backendBaseUrl}/api/stems/file/${jobId1}/vocals.wav`);
      assert.equal(f.status, 401);
    }

    // Split returns job_token
    let jobToken;
    {
      const body = new FormData();
      body.append("file", new Blob([DUMMY_STEM_BYTES], { type: "audio/wav" }), "test.wav");
      body.append("stems", "2");
      body.append("quality", "quality");

      const splitRes = await fetch(`${backendBaseUrl}/api/stems/split`, {
        method: "POST",
        body,
      });
      assert.equal(splitRes.status, 202);
      const splitJson = await splitRes.json();
      assert.equal(splitJson.job_id, jobId1);
      assert.ok(typeof splitJson.job_token === "string" && splitJson.job_token.length > 0);
      jobToken = splitJson.job_token;
    }

    // Status accepts job_token and returns tokenized stem URLs
    {
      const statusRes = await fetch(`${backendBaseUrl}/api/stems/status/${jobId1}`, {
        headers: { "x-job-token": jobToken },
      });
      assert.equal(statusRes.status, 200);
      const statusJson = await statusRes.json();
      assert.equal(statusJson.status, "completed");
      assert.ok(Array.isArray(statusJson.stems) && statusJson.stems.length === 1);
      assert.ok(statusJson.stems[0].url.includes("token="));
    }

    // File accepts job_token
    {
      const fileRes = await fetch(`${backendBaseUrl}/api/stems/file/${jobId1}/vocals.wav`, {
        headers: { "x-job-token": jobToken },
      });
      assert.equal(fileRes.status, 200);
      assert.equal(fileRes.headers.get("content-type"), "audio/wav");
    }

    // Expand requires the source job token and returns a new job token
    let newJobToken;
    {
      const expandRes = await fetch(`${backendBaseUrl}/api/stems/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-job-token": jobToken },
        body: JSON.stringify({ job_id: jobId1, quality: "quality" }),
      });
      assert.equal(expandRes.status, 202);
      const expandJson = await expandRes.json();
      assert.equal(expandJson.job_id, jobId2);
      assert.ok(typeof expandJson.job_token === "string" && expandJson.job_token.length > 0);
      newJobToken = expandJson.job_token;
    }

    {
      const statusRes2 = await fetch(`${backendBaseUrl}/api/stems/status/${jobId2}`, {
        headers: { "x-job-token": newJobToken },
      });
      assert.equal(statusRes2.status, 200);
    }

    // Cleanup route semantics + API_KEY guard
    {
      const cleanupGetRes = await fetch(`${backendBaseUrl}/api/stems/cleanup`);
      assert.equal(cleanupGetRes.status, 405);

      const cleanupPostRes = await fetch(`${backendBaseUrl}/api/stems/cleanup`, {
        method: "POST",
      });
      assert.equal(cleanupPostRes.status, 503);
    }
  } finally {
    backendServer.close();
    stubServer.close();
    // Best-effort cleanup; CI doesn't need exhaustive disk cleanup.
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

