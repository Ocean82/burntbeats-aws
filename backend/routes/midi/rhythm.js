// @ts-check
/**
 * Rhythm generation proxies — forwards to midi_service /rhythm/*.
 */
import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.js";
import {
  MIDI_ACCEPT_TIMEOUT_MS,
  MIDI_SERVICE_URL,
  withMidiServiceAuthHeader,
  handleMidiProxyError,
} from "./shared.js";

export const midiRhythmRouter = Router();

/**
 * @param {import("express").Response} res
 * @param {string} servicePath
 * @param {RequestInit} init
 */
async function proxyRhythmRequest(res, servicePath, init) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(MIDI_ACCEPT_TIMEOUT_MS, 30_000),
  );

  let serviceRes;
  try {
    serviceRes = await fetch(`${MIDI_SERVICE_URL}${servicePath}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const contentType = serviceRes.headers.get("content-type") || "";
  const text = await serviceRes.text().catch(() => "");

  if (contentType.includes("application/json")) {
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return res.status(502).json({ error: "Invalid JSON from MIDI service" });
    }
    if (!serviceRes.ok) {
      return res.status(serviceRes.status).json({
        error: data?.detail || data?.error || text || "Rhythm request failed",
      });
    }
    return res.json(data);
  }

  if (!serviceRes.ok) {
    return res.status(serviceRes.status).json({
      error: text || "Rhythm request failed",
    });
  }

  res.status(serviceRes.status);
  if (contentType) res.setHeader("Content-Type", contentType);
  const disposition = serviceRes.headers.get("content-disposition");
  if (disposition) res.setHeader("Content-Disposition", disposition);
  return res.send(Buffer.from(text, "binary"));
}

midiRhythmRouter.get("/styles", authMiddleware, async (req, res) => {
  try {
    const headers = withMidiServiceAuthHeader({});
    if (/** @type {any} */ (req).correlationId) {
      headers["X-Correlation-Id"] = /** @type {any} */ (req).correlationId;
    }
    return await proxyRhythmRequest(res, "/rhythm/styles", { method: "GET", headers });
  } catch (e) {
    await handleMidiProxyError(e, res, "[GET /api/midi/rhythm/styles]");
  }
});

midiRhythmRouter.post("/generate/json", authMiddleware, async (req, res) => {
  try {
    const headers = withMidiServiceAuthHeader({
      "Content-Type": "application/json",
    });
    if (/** @type {any} */ (req).correlationId) {
      headers["X-Correlation-Id"] = /** @type {any} */ (req).correlationId;
    }
    return await proxyRhythmRequest(res, "/rhythm/generate/json", {
      method: "POST",
      headers,
      body: JSON.stringify(req.body ?? {}),
    });
  } catch (e) {
    await handleMidiProxyError(e, res, "[POST /api/midi/rhythm/generate/json]");
  }
});
