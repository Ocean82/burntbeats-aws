import test from "node:test";
import assert from "node:assert/strict";

test("getMissingInternalServiceTokens when auth required", async () => {
  const prev = { ...process.env };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.INTERNAL_SERVICE_AUTH_REQUIRED;
    delete process.env.STEM_SERVICE_API_TOKEN;
    delete process.env.SPEECH_SERVICE_API_TOKEN;
    process.env.MIDI_SERVICE_API_TOKEN = "valid-midi-token-16c";

    const mod = await import("../lib/internalAuth.js");
    const missing = mod.getMissingInternalServiceTokens();
    assert.ok(missing.some((m) => m.includes("STEM_SERVICE_API_TOKEN")));
    assert.ok(missing.some((m) => m.includes("SPEECH_SERVICE_API_TOKEN")));
    assert.equal(
      missing.some((m) => m.includes("MIDI_SERVICE_API_TOKEN")),
      false,
    );
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("getMissingInternalServiceTokens skipped in development", async () => {
  const prev = { ...process.env };
  try {
    process.env.NODE_ENV = "development";
    delete process.env.INTERNAL_SERVICE_AUTH_REQUIRED;
    delete process.env.STEM_SERVICE_API_TOKEN;

    const mod = await import("../lib/internalAuth.js");
    assert.deepEqual(mod.getMissingInternalServiceTokens(), []);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
