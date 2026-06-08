// @ts-check
/**
 * GET /midi — Search/filter MIDI catalog.
 * GET /midi/:id/file — Download catalog MIDI file.
 */
import { Router } from "express";
import { access } from "fs/promises";

import { authMiddleware } from "../../middleware/auth.js";
import {
  getCatalogEntryById,
  inspectCatalogHealth,
  resolveCatalogFilePath,
  searchCatalogEntries,
} from "../../services/midi-catalog/index.js";

export const catalogRouter = Router();

catalogRouter.get("/midi", authMiddleware, async (req, res) => {
  try {
    const result = await searchCatalogEntries({
      q: req.query.q,
      genre: req.query.genre,
      type: req.query.type,
      key: req.query.key,
      complexity: req.query.complexity,
      tempo: req.query.tempo,
      minTempo: req.query.minTempo,
      maxTempo: req.query.maxTempo,
      offset: req.query.offset,
      limit: req.query.limit,
    });
    return res.json(result);
  } catch (e) {
    console.error("[GET /api/catalog/midi]", e);
    return res.status(500).json({ error: "Failed to load MIDI catalog" });
  }
});

catalogRouter.get("/midi/health", authMiddleware, async (_req, res) => {
  try {
    const health = await inspectCatalogHealth();
    return res.status(200).json(health);
  } catch (e) {
    console.error("[GET /api/catalog/midi/health]", e);
    return res
      .status(500)
      .json({ error: "Failed to inspect MIDI catalog health" });
  }
});

catalogRouter.get("/midi/:id/file", authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const entry = await getCatalogEntryById(id);
    if (!entry) {
      return res.status(404).json({ error: "Catalog entry not found" });
    }

    const filePath = resolveCatalogFilePath(id);
    if (!filePath) {
      return res.status(400).json({ error: "Invalid catalog id" });
    }
    try {
      await access(filePath);
    } catch {
      return res.status(404).json({
        error: "Catalog MIDI file not available in this environment.",
      });
    }

    const filename = entry.filename || `${id}.mid`;
    res.setHeader("Content-Type", "audio/midi");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.sendFile(filePath);
  } catch (e) {
    console.error("[GET /api/catalog/midi/:id/file]", e);
    return res.status(500).json({ error: "Failed to serve catalog file" });
  }
});
