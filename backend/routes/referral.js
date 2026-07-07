// @ts-check
import { Router } from "express";
import { verifyClerkBearer } from "../clerkAuth.js";
import {
  attachReferralCode,
  getReferralProfile,
  REFERRAL_BONUS_TOKENS,
} from "../referral/referralService.js";

export const referralRouter = Router();

referralRouter.get("/me", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const profile = await getReferralProfile(userId);
    if (!profile) {
      return res.status(503).json({ error: "Referral program unavailable" });
    }
    const origin =
      process.env.PUBLIC_APP_ORIGIN || "https://www.burntbeats.com";
    return res.json({
      code: profile.code,
      inviteCount: profile.inviteCount,
      tokensEarned: profile.tokensEarned,
      bonusTokens: REFERRAL_BONUS_TOKENS,
      shareUrl: `${origin.replace(/\/$/, "")}/?ref=${encodeURIComponent(profile.code)}`,
    });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    return res.status(status).json({ error: "Unauthorized" });
  }
});

referralRouter.post("/attach", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const code = typeof body.code === "string" ? body.code : "";
    const result = await attachReferralCode(userId, code);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || "Invalid code" });
    }
    return res.json({ ok: true });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    return res.status(status).json({ error: "Unauthorized" });
  }
});
