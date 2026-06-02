import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SERVER_EXPORT_MAX_CONCURRENT = "2";

const { acquireExportSlot, getActiveExportCount } = await import(
  "../lib/exportSemaphore.js"
);

test("export semaphore limits concurrent slots", async () => {
  const s1 = await acquireExportSlot();
  const s2 = await acquireExportSlot();
  assert.equal(getActiveExportCount(), 2);

  let thirdResolved = false;
  const third = acquireExportSlot().then(() => {
    thirdResolved = true;
  });

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(thirdResolved, false);

  s1.release();
  await third;
  assert.equal(thirdResolved, true);

  s2.release();
});
