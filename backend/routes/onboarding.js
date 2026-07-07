// @ts-check
import { Router } from "express";
import { verifyClerkBearer } from "../clerkAuth.js";
import { markFirstSplitComplete } from "../referral/referralService.js";

export const onboardingRouter = Router();

onboardingRouter.post("/first-split-complete", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    await markFirstSplitComplete(userId);
    return res.json({ ok: true });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    return res.status(status).json({ error: "Unauthorized" });
  }
});
