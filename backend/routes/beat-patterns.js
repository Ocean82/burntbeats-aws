// @ts-check
/**
 * Beat pattern cloud sync routes (Premium).
 */
import { Router } from "express";
import { verifyClerkBearer } from "../clerkAuth.js";
import {
  createBeatPattern,
  deleteBeatPattern,
  listBeatPatterns,
  updateBeatPattern,
} from "../db-beat-patterns.js";

export const beatPatternsRouter = Router();

function authUserId(req) {
  if (typeof req.app.locals.verifyClerkBearer === "function") {
    return req.app.locals.verifyClerkBearer(req);
  }
  return verifyClerkBearer(req);
}

/** @param {import("express").Request} req */
function beatPatternDb(req) {
  return req.app.locals.beatPatternDb ?? {
    listBeatPatterns,
    createBeatPattern,
    updateBeatPattern,
    deleteBeatPattern,
  };
}

beatPatternsRouter.get("/beat-patterns", async (req, res) => {
  try {
    const userId = await authUserId(req);
    const patterns = await beatPatternDb(req).listBeatPatterns(userId);
    return res.json({ patterns });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 500;
    const message =
      status === 401
        ? "Unauthorized"
        : e instanceof Error
          ? e.message
          : "Failed to list beat patterns";
    return res.status(status).json({ error: message });
  }
});

beatPatternsRouter.post("/beat-patterns", async (req, res) => {
  try {
    const userId = await authUserId(req);
    const { name, preset, tags } = req.body ?? {};
    if (!name || typeof name !== "string" || !preset || typeof preset !== "object") {
      return res.status(400).json({ error: "name and preset are required" });
    }
    const row = await beatPatternDb(req).createBeatPattern(userId, {
      name: name.trim(),
      preset,
      tags: Array.isArray(tags) ? tags.map(String) : [],
    });
    return res.status(201).json({ pattern: row });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 500;
    return res.status(status).json({
      error: e instanceof Error ? e.message : "Failed to create beat pattern",
    });
  }
});

beatPatternsRouter.put("/beat-patterns/:id", async (req, res) => {
  try {
    const userId = await authUserId(req);
    const { name, preset, tags } = req.body ?? {};
    const row = await beatPatternDb(req).updateBeatPattern(userId, req.params.id, {
      name: typeof name === "string" ? name.trim() : undefined,
      preset: preset && typeof preset === "object" ? preset : undefined,
      tags: Array.isArray(tags) ? tags.map(String) : undefined,
    });
    if (!row) return res.status(404).json({ error: "Pattern not found" });
    return res.json({ pattern: row });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 500;
    return res.status(status).json({
      error: e instanceof Error ? e.message : "Failed to update beat pattern",
    });
  }
});

beatPatternsRouter.delete("/beat-patterns/:id", async (req, res) => {
  try {
    const userId = await authUserId(req);
    const deleted = await beatPatternDb(req).deleteBeatPattern(userId, req.params.id);
    if (!deleted) return res.status(404).json({ error: "Pattern not found" });
    return res.status(204).send();
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 500;
    return res.status(status).json({
      error: e instanceof Error ? e.message : "Failed to delete beat pattern",
    });
  }
});
