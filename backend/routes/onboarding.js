// @ts-check
import { Router } from "express";
import { verifyClerkBearer } from "../clerkAuth.js";
import { markFirstSplitComplete } from "../referral/referralService.js";

export const onboardingRouter = Router();

onboardingRouter.post("/first-split-complete", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const result = await markFirstSplitComplete(userId);
    return res.json({ ok: true, completed: result.completed, rewarded: result.rewarded });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 500;
    const error =
      status === 401
        ? "Unauthorized"
        : "Unable to mark onboarding complete. Please try again.";
    return res.status(status).json({ error });
  }
});
