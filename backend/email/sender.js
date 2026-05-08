// @ts-check
/**
 * Email transport and sending logic.
 *
 * Lazily creates a Nodemailer transporter and provides the core sendEmail function
 * plus convenience wrappers for each template type.
 */
import nodemailer from "nodemailer";
import { TEMPLATES } from "./templates.js";

const EMAIL_CONFIG = {
  host: process.env.EMAIL_HOST || "smtp.ionos.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER || "burntbeats@burntbeats.com",
    pass: process.env.EMAIL_PASS || "",
  },
  tls: {
    rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== "false",
  },
};

const EMAIL_FROM = process.env.EMAIL_FROM || "burntbeats@burntbeats.com";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "BurntBeats";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "burntbeats@burntbeats.com";

/** @type {import("nodemailer").Transporter | null} */
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(EMAIL_CONFIG);
  }
  return transporter;
}

/**
 * Send an email using a template.
 * @param {string} to - Recipient email
 * @param {string} templateName - Template name (songReady, referralWelcome, etc.)
 * @param {object} data - Template data
 * @returns {Promise<object>}
 */
export async function sendEmail(to, templateName, data = {}) {
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== "true") {
    console.log(`[email] Notifications disabled. Would send ${templateName} to ${to}`);
    return { success: false, reason: "notifications_disabled" };
  }

  const template = TEMPLATES[templateName];
  if (!template) {
    console.error(`[email] Unknown template: ${templateName}`);
    return { success: false, reason: "unknown_template" };
  }

  try {
    const transport = getTransporter();
    const subject = data.subject || template.subject;
    const html = template.getHtml(data);

    const mailOptions = {
      from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
      to,
      subject,
      html,
      replyTo: EMAIL_REPLY_TO,
    };

    const result = await transport.sendMail(mailOptions);
    console.log(`[email] Sent ${templateName} to ${to}:`, result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`[email] Failed to send ${templateName} to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send song ready notification.
 */
export async function sendSongReadyEmail(to, songTitle, downloadUrl) {
  return sendEmail(to, "songReady", { songTitle, downloadUrl });
}

/**
 * Send referral welcome email.
 */
export async function sendReferralWelcomeEmail(to, referrerName, referralCode, signupUrl) {
  return sendEmail(to, "referralWelcome", { referrerName, referralCode, signupUrl });
}

/**
 * Send referral reward email.
 */
export async function sendReferralRewardEmail(to, tier, reward) {
  return sendEmail(to, "referralReward", { tier, reward });
}

/**
 * Send error notification.
 */
export async function sendErrorEmail(to, songTitle, error) {
  if (process.env.NOTIFY_ON_ERROR !== "true") {
    return { success: false, reason: "error_notifications_disabled" };
  }
  return sendEmail(to, "error", { songTitle, error });
}

/**
 * Send welcome email.
 */
export async function sendWelcomeEmail(to) {
  return sendEmail(to, "welcome", {});
}

/**
 * Test email configuration — verifies SMTP connection.
 */
export async function testEmailConfig() {
  try {
    const transport = getTransporter();
    await transport.verify();
    console.log("[email] SMTP configuration is valid");
    return { success: true };
  } catch (error) {
    console.error("[email] SMTP configuration error:", error.message);
    return { success: false, error: error.message };
  }
}
