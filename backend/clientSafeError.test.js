// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  isLikelySafeUserFacingMessage,
  publicErrorMessage,
  sanitizedProxyClientError,
} from "./clientSafeError.js";

test("isLikelySafeUserFacingMessage allows normal validation text", () => {
  assert.equal(isLikelySafeUserFacingMessage("stems must be '2' or '4'"), true);
  assert.equal(isLikelySafeUserFacingMessage("Unauthorized"), true);
});

test("isLikelySafeUserFacingMessage rejects paths and tracebacks", () => {
  assert.equal(isLikelySafeUserFacingMessage("Failed: /tmp/foo.wav"), false);
  assert.equal(isLikelySafeUserFacingMessage("Traceback (most recent call last):"), false);
  assert.equal(isLikelySafeUserFacingMessage("connect ECONNREFUSED 127.0.0.1:6379"), false);
});

test("sanitizedProxyClientError uses fallback for unsafe upstream text", () => {
  assert.equal(
    sanitizedProxyClientError(400, "Failed to save upload: [Errno 13] /repo/tmp/x"),
    "Request could not be completed.",
  );
  assert.equal(
    sanitizedProxyClientError(500, "Internal Server Error"),
    "The stem service had a problem. Please try again.",
  );
});

test("sanitizedProxyClientError keeps safe stem validation messages", () => {
  assert.equal(
    sanitizedProxyClientError(400, "Invalid stems value. Must be '2' or '4'."),
    "Invalid stems value. Must be '2' or '4'.",
  );
});

test("publicErrorMessage returns fallback for empty raw", () => {
  assert.equal(publicErrorMessage("", "fallback", "[test]"), "fallback");
});
