// @ts-check
/**
 * Legal acceptance route: one-time gate for ToS + Privacy Policy.
 */
import { Router } from "express";
import { verifyClerkBearer, getClerkClient } from "../clerkAuth.js";

// Defaults must stay aligned with frontend/src/legal/versions.ts → LEGAL_VERSIONS.
const LEGAL_TOS_VERSION = process.env.LEGAL_TOS_VERSION || "2026-05";
const LEGAL_PRIVACY_VERSION = process.env.LEGAL_PRIVACY_VERSION || "2026-05";

export const legalRouter = Router();

legalRouter.post("/accept", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const clerk = getClerkClient();
    if (!clerk) return res.status(503).json({ error: "Auth not configured" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const tosVersion =
      typeof body.tosVersion === "string" && body.tosVersion
        ? body.tosVersion
        : "";
    const privacyVersion =
      typeof body.privacyVersion === "string" && body.privacyVersion
        ? body.privacyVersion
        : "";
    if (
      tosVersion !== LEGAL_TOS_VERSION ||
      privacyVersion !== LEGAL_PRIVACY_VERSION
    ) {
      return res.status(400).json({
        error: "Invalid legal document version.",
      });
    }

    const u = await clerk.users.getUser(userId);
    const existing =
      u && u.publicMetadata && typeof u.publicMetadata === "object"
        ? u.publicMetadata
        : {};
    const next = {
      ...existing,
      legalAccepted: {
        tosVersion: LEGAL_TOS_VERSION,
        privacyVersion: LEGAL_PRIVACY_VERSION,
        acceptedAt: new Date().toISOString(),
      },
    };
    await clerk.users.updateUser(userId, { publicMetadata: next });
    return res.json({ ok: true });
  } catch (e) {
    const status =
      e &&
      typeof e === "object" &&
      "status" in e &&
      typeof e.status === "number"
        ? e.status
        : 401;
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return res.status(status).json({ error: msg });
  }
});
