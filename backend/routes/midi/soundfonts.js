// @ts-check
/**
 * GET /soundfonts — List available soundfonts from midi_service.
 */
import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.js";
import {
  MIDI_SERVICE_URL,
  withMidiServiceAuthHeader,
} from "./shared.js";

export const midiSoundfontsRouter = Router();

midiSoundfontsRouter.get("/", authMiddleware, async (req, res) => {
  try {
    const headers = withMidiServiceAuthHeader({});
    if (/** @type {any} */ (req).correlationId) {
      headers["X-Correlation-Id"] = /** @type {any} */ (req).correlationId;
    }

    const serviceRes = await fetch(`${MIDI_SERVICE_URL}/soundfonts`, { headers });
    const text = await serviceRes.text().catch(() => "");
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return res.status(502).json({ error: "Invalid JSON from MIDI service" });
    }

    if (!serviceRes.ok) {
      return res.status(serviceRes.status).json({
        error: data?.detail || data?.error || "Soundfont list unavailable",
      });
    }

    return res.json(data);
  } catch (e) {
    console.error("[GET /api/midi/soundfonts] error:", e);
    return res.status(502).json({ error: "MIDI service unavailable" });
  }
});
