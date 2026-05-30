// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSplitRequestBody,
  isPremiumIntentRequest,
  legacyStemsFromIntent,
} from "./splitIntent.js";

test("parseSplitRequestBody maps legacy stems", () => {
  const parsed = parseSplitRequestBody({ stems: "2", quality: "speed" });
  assert.equal(parsed.error, null);
  assert.equal(parsed.intent, null);
  assert.equal(parsed.stems, "2");
  assert.equal(parsed.quality, "speed");
});

test("parseSplitRequestBody parses intent JSON", () => {
  const parsed = parseSplitRequestBody({
    intent: JSON.stringify({
      task: "extract",
      targets: ["vocals"],
      quality: "fast",
    }),
  });
  assert.equal(parsed.error, null);
  assert.ok(parsed.intent);
  assert.equal(parsed.intent?.task, "extract");
  assert.equal(parsed.stems, "2");
  assert.equal(parsed.quality, "speed");
});

test("isPremiumIntentRequest flags multi non-vocal extract", () => {
  assert.equal(
    isPremiumIntentRequest(
      { task: "extract", targets: ["drums", "bass"], quality: "fast" },
      "2",
      "speed",
    ),
    true,
  );
});

test("legacyStemsFromIntent full separation", () => {
  assert.equal(
    legacyStemsFromIntent({ task: "full_separation", mode: "4" }),
    "4",
  );
});
