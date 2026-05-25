// @ts-check
/**
 * GET / — returns MIDI conversion history for the authenticated user.
 * Scans MIDI_OUTPUT_DIR for job directories containing metadata.json,
 * filters by the authenticated user's Clerk ID.
 */
import { Router } from "express";
import { readdir } from "fs/promises";

import { authMiddleware } from "../../middleware/auth.js";
import {
  MIDI_OUTPUT_DIR,
  midiOutputExists,
  readMidiJobMetadata,
  verifyMidiOwner,
} from "./shared.js";

export const midiHistoryRouter = Router();

midiHistoryRouter.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = await verifyMidiOwner(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Scan MIDI_OUTPUT_DIR for job directories containing metadata.json
    const entries = await readdir(MIDI_OUTPUT_DIR, { withFileTypes: true }).catch(() => []);
    const conversions = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const meta = await readMidiJobMetadata(entry.name);
        if (!meta) continue;
        if (meta.user_id === userId) {
          const file_available = await midiOutputExists(entry.name);
          conversions.push({
            job_id: meta.job_id,
            stem_job_id: meta.stem_job_id || null,
            stem_name: meta.stem_name || null,
            notes_detected: meta.notes_detected || 0,
            duration_seconds: meta.duration_seconds || 0,
            created_at: meta.created_at || null,
            file_available,
          });
        }
      } catch {
        // Skip directories without valid metadata
        continue;
      }
    }

    // Sort by created_at descending
    conversions.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

    return res.json({ conversions });
  } catch (e) {
    console.error("[GET /api/midi/history] error:", e);
    return res.status(500).json({ error: "Failed to load MIDI history" });
  }
});
