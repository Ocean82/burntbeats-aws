// @ts-check
/**
 * GET / — returns MIDI conversion history for the authenticated user.
 * Scans MIDI_OUTPUT_DIR for job directories containing metadata.json,
 * filters by the authenticated user's Clerk ID.
 */
import { Router } from "express";
import { access, readdir, readFile } from "fs/promises";
import path from "path";

import { authMiddleware } from "../../middleware/auth.js";
import { verifyClerkBearer } from "../../clerkAuth.js";
import { MIDI_OUTPUT_DIR } from "./shared.js";

export const midiHistoryRouter = Router();

midiHistoryRouter.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Scan MIDI_OUTPUT_DIR for job directories containing metadata.json
    const entries = await readdir(MIDI_OUTPUT_DIR, { withFileTypes: true }).catch(() => []);
    const conversions = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(MIDI_OUTPUT_DIR, entry.name, "metadata.json");
      try {
        const raw = await readFile(metaPath, "utf-8");
        const meta = JSON.parse(raw);
        if (meta.user_id === userId) {
          const midPath = path.join(MIDI_OUTPUT_DIR, entry.name, "output.mid");
          let file_available = false;
          try {
            await access(midPath);
            file_available = true;
          } catch {
            // output.mid missing (cleaned up or failed before write)
          }
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
