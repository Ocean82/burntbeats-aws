// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import os from "os";

import {
  isSafePathSegment,
  resolvePathUnderAllowedBases,
  resolvePathWithinBase,
  resolveUuidJobDir,
} from "./safePath.js";

test("isSafePathSegment rejects traversal segments", () => {
  assert.equal(isSafePathSegment(".."), false);
  assert.equal(isSafePathSegment("../etc/passwd"), false);
  assert.equal(isSafePathSegment("vocals.wav"), true);
});

test("resolvePathWithinBase blocks escape from base", () => {
  const base = path.join(os.tmpdir(), "bb-safe-path-test");
  assert.equal(resolvePathWithinBase(base, "..", "etc", "passwd"), null);
  const ok = resolvePathWithinBase(base, "job-id", "input.wav");
  assert.ok(ok);
  assert.ok(ok.startsWith(path.resolve(base)));
});

test("resolveUuidJobDir requires UUID", () => {
  const base = path.join(os.tmpdir(), "bb-safe-path-uuid");
  assert.equal(resolveUuidJobDir(base, "not-a-uuid"), null);
  const id = "550e8400-e29b-41d4-a716-446655440000";
  assert.ok(resolveUuidJobDir(base, id));
});

test("resolvePathUnderAllowedBases only allows listed roots", () => {
  const stemBase = path.join(os.tmpdir(), "bb-stems");
  const midiBase = path.join(os.tmpdir(), "bb-midi");
  const inside = path.join(stemBase, "550e8400-e29b-41d4-a716-446655440000", "input.wav");
  assert.equal(
    resolvePathUnderAllowedBases(inside, [stemBase, midiBase]),
    path.resolve(inside),
  );
  assert.equal(
    resolvePathUnderAllowedBases("/etc/passwd", [stemBase, midiBase]),
    null,
  );
  assert.equal(
    resolvePathUnderAllowedBases(
      path.join(stemBase, "..", "..", "etc", "passwd"),
      [stemBase],
    ),
    null,
  );
});
