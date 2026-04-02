import { Router } from "express";
import { verifyClerkBearer } from "./clerkAuth.js";
import {
  sendEmail,
  sendSongReadyEmail,
  sendReferralWelcomeEmail,
  sendReferralRewardEmail,
  sendErrorEmail,
  sendWelcomeEmail,
  testEmailConfig,
} from "./email-service.js";

// ============================================
// EMAIL API ROUTES
// ============================================

export const emailRouter = Router();

/** Basic RFC-5322-ish email format check */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

/**
 * Require a valid Clerk Bearer token on all email routes.
 * These routes trigger outbound email via your SMTP credentials — they must not be open.
 */
emailRouter.use(async (req, res, next) => {
  try {
    await verifyClerkBearer(req);
    next();
  } catch (/** @type {any} */ err) {
    return res.status(err.status || 401).json({ success: false, error: "Unauthorized" });
  }
});

// Test email configuration — admin/debug only, auth already required above
emailRouter.get("/test", async (req, res) => {
  try {
    const result = await testEmailConfig();
    res.json(result);
  } catch {
    res.status(500).json({ success: false, error: "Email configuration test failed" });
  }
});

// Send song ready notification
emailRouter.post("/song-ready", async (req, res) => {
  const { email, songTitle, downloadUrl } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: "Missing or invalid email address" });
  }
  if (!songTitle || typeof songTitle !== "string") {
    return res.status(400).json({ success: false, error: "Missing required field: songTitle" });
  }

  try {
    const result = await sendSongReadyEmail(email.trim(), songTitle, downloadUrl);
    res.json(result);
  } catch {
    res.status(500).json({ success: false, error: "Failed to send email" });
  }
});

// Send referral welcome email
emailRouter.post("/referral-welcome", async (req, res) => {
  const { email, referrerName, referralCode, signupUrl } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: "Missing or invalid email address" });
  }

  try {
    const result = await sendReferralWelcomeEmail(
      email.trim(),
      referrerName || "A friend",
      referralCode || "FRIEND",
      signupUrl || "https://burntbeats.com"
    );
    res.json(result);
  } catch {
    res.status(500).json({ success: false, error: "Failed to send email" });
  }
});

// Send referral reward email
emailRouter.post("/referral-reward", async (req, res) => {
  const { email, tier, reward } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: "Missing or invalid email address" });
  }
  if (!tier || !reward) {
    return res.status(400).json({ success: false, error: "Missing required fields: tier, reward" });
  }

  try {
    const result = await sendReferralRewardEmail(email.trim(), tier, reward);
    res.json(result);
  } catch {
    res.status(500).json({ success: false, error: "Failed to send email" });
  }
});

// Send error notification
emailRouter.post("/error", async (req, res) => {
  const { email, songTitle, error } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: "Missing or invalid email address" });
  }

  try {
    const result = await sendErrorEmail(email.trim(), songTitle, error);
    res.json(result);
  } catch {
    res.status(500).json({ success: false, error: "Failed to send email" });
  }
});

// Send welcome email
emailRouter.post("/welcome", async (req, res) => {
  const { email } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: "Missing or invalid email address" });
  }

  try {
    const result = await sendWelcomeEmail(email.trim());
    res.json(result);
  } catch {
    res.status(500).json({ success: false, error: "Failed to send email" });
  }
});

// Send custom email
emailRouter.post("/send", async (req, res) => {
  const { to, template, data } = req.body;

  if (!isValidEmail(to)) {
    return res.status(400).json({ success: false, error: "Missing or invalid recipient email address" });
  }
  if (!template || typeof template !== "string") {
    return res.status(400).json({ success: false, error: "Missing required field: template" });
  }

  try {
    const result = await sendEmail(to.trim(), template, data || {});
    res.json(result);
  } catch {
    res.status(500).json({ success: false, error: "Failed to send email" });
  }
});

export default emailRouter;
