/**
 * Newsletter subscription endpoint (v1).
 * Logs emails to stdout for manual processing.
 * Replace with Mailchimp/ConvertKit API integration in production.
 */
import { Router } from "express";

export const newsletterRouter = Router();

newsletterRouter.post("/subscribe", async (req, res) => {
  try {
    const { email } = req.body && typeof req.body === "object" ? req.body : {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }
    console.log("[newsletter] New subscriber:", email);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Internal error" });
  }
});
