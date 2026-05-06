// @ts-check
/**
 * Health check route.
 */
import { Router } from "express";
import { healthCheck as dbHealthCheck } from "../db.js";

export const healthRouter = Router();

healthRouter.get("/", async (req, res) => {
  const db = await dbHealthCheck();
  const payload = {
    status: db.ok ? "ok" : "degraded",
    rate_limited: !!process.env.API_KEY,
    database: {
      connected: db.ok,
      latencyMs: db.latencyMs,
      ...(db.error ? { error: db.error } : {}),
    },
  };
  res.status(200).json(payload);
});
