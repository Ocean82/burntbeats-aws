import { Router } from "express";
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

// Test email configuration
emailRouter.get("/test", async (req, res) => {
  try {
    const result = await testEmailConfig();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send song ready notification
emailRouter.post("/song-ready", async (req, res) => {
  const { email, songTitle, downloadUrl } = req.body;

  if (!email || !songTitle) {
    return res.status(400).json({ success: false, error: "Missing required fields: email, songTitle" });
  }

  try {
    const result = await sendSongReadyEmail(email, songTitle, downloadUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send referral welcome email
emailRouter.post("/referral-welcome", async (req, res) => {
  const { email, referrerName, referralCode, signupUrl } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: "Missing required field: email" });
  }

  try {
    const result = await sendReferralWelcomeEmail(
      email,
      referrerName || "A friend",
      referralCode || "FRIEND",
      signupUrl || "https://burntbeats.com"
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send referral reward email
emailRouter.post("/referral-reward", async (req, res) => {
  const { email, tier, reward } = req.body;

  if (!email || !tier || !reward) {
    return res.status(400).json({ success: false, error: "Missing required fields: email, tier, reward" });
  }

  try {
    const result = await sendReferralRewardEmail(email, tier, reward);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send error notification
emailRouter.post("/error", async (req, res) => {
  const { email, songTitle, error } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: "Missing required field: email" });
  }

  try {
    const result = await sendErrorEmail(email, songTitle, error);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send welcome email
emailRouter.post("/welcome", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: "Missing required field: email" });
  }

  try {
    const result = await sendWelcomeEmail(email);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send custom email
emailRouter.post("/send", async (req, res) => {
  const { to, template, data } = req.body;

  if (!to || !template) {
    return res.status(400).json({ success: false, error: "Missing required fields: to, template" });
  }

  try {
    const result = await sendEmail(to, template, data || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default emailRouter;
