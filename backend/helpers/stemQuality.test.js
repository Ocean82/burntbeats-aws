// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStemQuality,
  STEM_QUALITY_ERROR,
} from "./stemQuality.js";

test("normalizeStemQuality maps balanced to quality", () => {
  const result = normalizeStemQuality("balanced");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.quality, "quality");
});

test("normalizeStemQuality maps ultra to quality", () => {
  const result = normalizeStemQuality("ultra");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.quality, "quality");
});

test("normalizeStemQuality passes speed and quality through", () => {
  assert.deepEqual(normalizeStemQuality("speed"), {
    ok: true,
    quality: "speed",
  });
  assert.deepEqual(normalizeStemQuality("quality"), {
    ok: true,
    quality: "quality",
  });
});

test("normalizeStemQuality returns undefined for empty input", () => {
  assert.deepEqual(normalizeStemQuality(undefined), {
    ok: true,
    quality: undefined,
  });
  assert.deepEqual(normalizeStemQuality(""), { ok: true, quality: undefined });
});

test("normalizeStemQuality rejects unknown values", () => {
  const result = normalizeStemQuality("bogus");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, STEM_QUALITY_ERROR);
});
