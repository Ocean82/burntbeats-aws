// @ts-check
/**
 * POST /analyze — Proxy harmonic analysis requests to midi_service.
 */
import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.js";
import {
  MIDI_ACCEPT_TIMEOUT_MS,
  MIDI_SERVICE_URL,
  withMidiServiceAuthHeader,
  handleMidiProxyError,
} from "./shared.js";

export const midiAnalyzeRouter = Router();

/**
 * POST / — Analyze piano-roll note events for key, chords, and progression.
 */
midiAnalyzeRouter.post("/", authMiddleware, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Request body is required" });
    }

    const notes = body.notes;
    if (notes !== undefined && !Array.isArray(notes)) {
      return res.status(400).json({ error: "'notes' must be an array" });
    }

    const headers = withMidiServiceAuthHeader({
      "Content-Type": "application/json",
    });
    if (/** @type {any} */ (req).correlationId) {
      headers["X-Correlation-Id"] = /** @type {any} */ (req).correlationId;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(MIDI_ACCEPT_TIMEOUT_MS, 30_000),
    );

    let serviceRes;
    try {
      serviceRes = await fetch(`${MIDI_SERVICE_URL}/analyze`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await serviceRes.text().catch(() => "");
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return res.status(502).json({ error: "Invalid JSON from MIDI service" });
    }

    if (!serviceRes.ok) {
      return res.status(serviceRes.status).json({
        error: data?.detail || data?.error || text || "Harmonic analysis failed",
      });
    }

    return res.json(data);
  } catch (e) {
    await handleMidiProxyError(e, res, "[POST /api/midi/analyze]");
  }
});
