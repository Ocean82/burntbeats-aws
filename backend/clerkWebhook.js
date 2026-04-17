// @ts-check
import express from "express";
import { Webhook } from "svix";
import { grantWelcomeSignupTokens } from "./usageTokens.js";

const router = express.Router();

/**
 * Clerk webhook handler.
 * Handles user.created for one-time welcome token grants.
 */
router.post("/webhook", async (req, res) => {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET || "";
  if (!signingSecret) {
    return res.status(503).json({ error: "Clerk webhook not configured" });
  }

  const svixId = req.header("svix-id");
  const svixTimestamp = req.header("svix-timestamp");
  const svixSignature = req.header("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: "Missing Svix headers" });
  }

  try {
    const wh = new Webhook(signingSecret);
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
    const evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });

    if (evt && typeof evt === "object" && "type" in evt && evt.type === "user.created") {
      const data = "data" in evt && evt.data && typeof evt.data === "object" ? evt.data : null;
      const clerkUserId = data && "id" in data && typeof data.id === "string" ? data.id : "";
      if (clerkUserId) {
        const grant = Math.floor(Number(process.env.USAGE_SIGNUP_WELCOME_TOKENS || 5));
        const welcome = await grantWelcomeSignupTokens(clerkUserId, grant);
        if (welcome.granted) {
          console.log(
            `[clerk/webhook] welcome grant credited user=${clerkUserId} amount=${grant} balance=${welcome.balance}`,
          );
        } else {
          console.log(`[clerk/webhook] welcome grant skipped user=${clerkUserId}`);
        }
      }
    }

    return res.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown webhook error";
    console.error("[clerk/webhook] verify/handler error:", msg);
    return res.status(400).json({ error: "Invalid webhook request" });
  }
});

export { router as clerkWebhookRouter };
