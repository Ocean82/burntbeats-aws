// @ts-check
/**
 * Write a single Server-Sent Events `data` frame. Payload is JSON-serialized (not HTML).
 * @param {import("express").Response} res
 * @param {unknown} payload
 */
export function writeSseJson(res, payload) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
