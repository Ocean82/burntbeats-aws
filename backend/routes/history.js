// @ts-check
/**
 * Job history and token history routes.
 */
import { Router } from "express";
import { verifyClerkBearer } from "../clerkAuth.js";
import { getJobHistory } from "../db-jobs.js";
import { getTokenHistory } from "../db-tokens.js";

export const historyRouter = Router();

historyRouter.get("/jobs/history", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const jobs = await getJobHistory(userId, { limit, offset });
    return res.json({ jobs });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    return res.status(status).json({ error: "Unauthorized" });
  }
});

historyRouter.get("/billing/token-history", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const transactions = await getTokenHistory(userId, { limit });
    return res.json({ transactions });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    return res.status(status).json({ error: "Unauthorized" });
  }
});
