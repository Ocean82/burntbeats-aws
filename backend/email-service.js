import nodemailer from "nodemailer";
import { readFileSync, existsSync } from "fs";

// ============================================
// BURNTBEATS EMAIL SERVICE
// Uses IONOS SMTP for transactional emails
// ============================================

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

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(EMAIL_CONFIG);
  }
  return transporter;
}

// ============================================
// EMAIL TEMPLATES
// ============================================

const TEMPLATES = {
  songReady: {
    subject: "Your song is ready! 🎵",
    getHtml: (data) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .card { background: #1a1a2e; border-radius: 16px; padding: 32px; margin-bottom: 24px; }
    .button { display: inline-block; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🔥 BurntBeats</div>
    </div>
    <div class="card">
      <h1 style="margin: 0 0 16px 0; font-size: 28px;">Your song is ready! 🎵</h1>
      <p style="color: #a0a0b0; font-size: 16px; line-height: 1.6;">
        Great news! Your track <strong>"${data.songTitle || "Untitled"}"</strong> has been processed and is ready to download.
      </p>
      <p style="color: #a0a0b0; font-size: 16px; line-height: 1.6;">
        Your stems have been split and are waiting for you in your dashboard.
      </p>
      <div style="text-align: center; margin-top: 32px;">
        <a href="${data.downloadUrl || "https://burntbeats.com"}" class="button">
          Download Your Stems →
        </a>
      </div>
    </div>
    <div class="footer">
      <p>You're receiving this because you requested a stem split on BurntBeats.</p>
      <p>© 2024 BurntBeats. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },

  referralWelcome: {
    subject: "You've been invited to BurntBeats! 🎵",
    getHtml: (data) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .card { background: #1a1a2e; border-radius: 16px; padding: 32px; margin-bottom: 24px; }
    .button { display: inline-block; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; }
    .feature { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .feature-icon { font-size: 24px; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🔥 BurntBeats</div>
    </div>
    <div class="card">
      <h1 style="margin: 0 0 16px 0; font-size: 28px;">You've been invited! 🎉</h1>
      <p style="color: #a0a0b0; font-size: 16px; line-height: 1.6;">
        <strong>${data.referrerName || "A friend"}</strong> thinks you'd love BurntBeats - the AI-powered stem splitter that's changing how producers work.
      </p>
      
      <div style="margin: 24px 0;">
        <div class="feature">
          <span class="feature-icon">🤖</span>
          <span>AI stem separation in seconds</span>
        </div>
        <div class="feature">
          <span class="feature-icon">🎹</span>
          <span>Built-in lite DAW for instant editing</span>
        </div>
        <div class="feature">
          <span class="feature-icon">⚡</span>
          <span>100% browser-based - no downloads</span>
        </div>
        <div class="feature">
          <span class="feature-icon">💰</span>
          <span>Free to start - no credit card required</span>
        </div>
      </div>

      <div style="text-align: center; margin-top: 32px;">
        <a href="${data.signupUrl || "https://burntbeats.com"}" class="button">
          Try BurntBeats Free →
        </a>
      </div>
      
      <p style="color: #a0a0b0; font-size: 14px; text-align: center; margin-top: 16px;">
        Use code <strong>${data.referralCode || "FRIEND"}</strong> to get started
      </p>
    </div>
    <div class="footer">
      <p>You're receiving this because ${data.referrerName || "someone"} invited you to try BurntBeats.</p>
      <p>© 2024 BurntBeats. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },

  referralReward: {
    subject: "You earned a reward! 🎁",
    getHtml: (data) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .card { background: #1a1a2e; border-radius: 16px; padding: 32px; margin-bottom: 24px; }
    .reward-badge { display: inline-block; background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%); color: #000; padding: 8px 16px; border-radius: 20px; font-weight: 700; font-size: 14px; margin-bottom: 16px; }
    .button { display: inline-block; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🔥 BurntBeats</div>
    </div>
    <div class="card">
      <div style="text-align: center;">
        <span class="reward-badge">🎁 REWARD UNLOCKED</span>
      </div>
      <h1 style="margin: 0 0 16px 0; font-size: 28px; text-align: center;">Congratulations!</h1>
      <p style="color: #a0a0b0; font-size: 16px; line-height: 1.6; text-align: center;">
        You've reached <strong>${data.tier || "Bronze"}</strong> tier and earned:
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <div style="font-size: 36px; font-weight: 800; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
          ${data.reward || "7 days Pro"}
        </div>
      </div>
      <p style="color: #a0a0b0; font-size: 16px; line-height: 1.6; text-align: center;">
        Your Pro access has been automatically applied to your account. Enjoy unlimited stem splitting, full quality exports, and all Pro features!
      </p>
      <div style="text-align: center; margin-top: 32px;">
        <a href="https://burntbeats.com" class="button">
          Start Using Pro →
        </a>
      </div>
    </div>
    
    <div class="card" style="text-align: center;">
      <h3 style="margin: 0 0 16px 0;">Keep Going!</h3>
      <p style="color: #a0a0b0; font-size: 14px;">
        Refer more friends to unlock even bigger rewards:
      </p>
      <div style="display: flex; justify-content: center; gap: 16px; margin-top: 16px; flex-wrap: wrap;">
        <div style="background: rgba(255,255,255,0.1); padding: 12px 16px; border-radius: 8px;">
          <div style="font-weight: 700;">🥈 Silver</div>
          <div style="font-size: 12px; color: #a0a0b0;">10 refs → 30 days</div>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 12px 16px; border-radius: 8px;">
          <div style="font-weight: 700;">🥇 Gold</div>
          <div style="font-size: 12px; color: #a0a0b0;">25 refs → 90 days</div>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 12px 16px; border-radius: 8px;">
          <div style="font-weight: 700;">💎 Diamond</div>
          <div style="font-size: 12px; color: #a0a0b0;">100 refs → Lifetime</div>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>Keep sharing your referral link to earn more rewards!</p>
      <p>© 2024 BurntBeats. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },

  error: {
    subject: "Something went wrong with your track ⚠️",
    getHtml: (data) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .card { background: #1a1a2e; border-radius: 16px; padding: 32px; margin-bottom: 24px; }
    .button { display: inline-block; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🔥 BurntBeats</div>
    </div>
    <div class="card">
      <h1 style="margin: 0 0 16px 0; font-size: 28px;">Oops! Something went wrong ⚠️</h1>
      <p style="color: #a0a0b0; font-size: 16px; line-height: 1.6;">
        We encountered an issue while processing your track <strong>"${data.songTitle || "Untitled"}"</strong>.
      </p>
      <p style="color: #a0a0b0; font-size: 16px; line-height: 1.6;">
        Error: ${data.error || "Unknown error occurred"}
      </p>
      <p style="color: #a0a0b0; font-size: 16px; line-height: 1.6;">
        Don't worry - you can try again. If the problem persists, please contact our support team.
      </p>
      <div style="text-align: center; margin-top: 32px;">
        <a href="https://burntbeats.com" class="button">
          Try Again →
        </a>
      </div>
    </div>
    <div class="footer">
      <p>Need help? Reply to this email or contact support@burntbeats.com</p>
      <p>© 2024 BurntBeats. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },

  welcome: {
    subject: "Welcome to BurntBeats! 🎵",
    getHtml: (data) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .card { background: #1a1a2e; border-radius: 16px; padding: 32px; margin-bottom: 24px; }
    .step { display: flex; gap: 16px; margin-bottom: 20px; }
    .step-number { width: 32px; height: 32px; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
    .button { display: inline-block; background: linear-gradient(135deg, #e94560 0%, #ff6b8a 100%); color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; }
    .referral-box { background: rgba(233, 69, 96, 0.2); border: 1px solid rgba(233, 69, 96, 0.3); border-radius: 12px; padding: 20px; text-align: center; margin-top: 24px; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🔥 BurntBeats</div>
    </div>
    <div class="card">
      <h1 style="margin: 0 0 16px 0; font-size: 28px;">Welcome to BurntBeats! 🎉</h1>
      <p style="color: #a0a0b0; font-size: 16px; line-height: 1.6;">
        You're now part of a community of producers using AI to transform their workflow. Let's get you started!
      </p>
      
      <h3 style="margin: 24px 0 16px 0;">Quick Start Guide:</h3>
      
      <div class="step">
        <div class="step-number">1</div>
        <div>
          <strong>Upload a track</strong>
          <p style="color: #a0a0b0; margin: 4px 0 0 0;">Drop any song - MP3, WAV, or FLAC</p>
        </div>
      </div>
      
      <div class="step">
        <div class="step-number">2</div>
        <div>
          <strong>Let AI work its magic</strong>
          <p style="color: #a0a0b0; margin: 4px 0 0 0;">Stems separate in ~15 seconds</p>
        </div>
      </div>
      
      <div class="step">
        <div class="step-number">3</div>
        <div>
          <strong>Edit & Export</strong>
          <p style="color: #a0a0b0; margin: 4px 0 0 0;">Use the built-in DAW or download stems</p>
        </div>
      </div>

      <div style="text-align: center; margin-top: 32px;">
        <a href="https://burntbeats.com" class="button">
          Start Splitting →
        </a>
      </div>
      
      <div class="referral-box">
        <h3 style="margin: 0 0 8px 0;">🎵 Want free Pro access?</h3>
        <p style="color: #a0a0b0; margin: 0 0 12px 0; font-size: 14px;">
          Share your referral link and earn rewards for every friend who signs up!
        </p>
        <a href="https://burntbeats.com/referral" style="color: #e94560; font-weight: 600;">
          Get Your Referral Link →
        </a>
      </div>
    </div>
    <div class="footer">
      <p>Follow us on Twitter for tips and updates: @burntbeats</p>
      <p>© 2024 BurntBeats. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  },
};

// ============================================
// EMAIL SENDING FUNCTIONS
// ============================================

/**
 * Send an email using a template
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
 * Send song ready notification
 */
export async function sendSongReadyEmail(to, songTitle, downloadUrl) {
  return sendEmail(to, "songReady", { songTitle, downloadUrl });
}

/**
 * Send referral welcome email
 */
export async function sendReferralWelcomeEmail(to, referrerName, referralCode, signupUrl) {
  return sendEmail(to, "referralWelcome", { referrerName, referralCode, signupUrl });
}

/**
 * Send referral reward email
 */
export async function sendReferralRewardEmail(to, tier, reward) {
  return sendEmail(to, "referralReward", { tier, reward });
}

/**
 * Send error notification
 */
export async function sendErrorEmail(to, songTitle, error) {
  if (process.env.NOTIFY_ON_ERROR !== "true") {
    return { success: false, reason: "error_notifications_disabled" };
  }
  return sendEmail(to, "error", { songTitle, error });
}

/**
 * Send welcome email
 */
export async function sendWelcomeEmail(to) {
  return sendEmail(to, "welcome", {});
}

/**
 * Test email configuration
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

// ============================================
// EXPORTS
// ============================================

export default {
  sendEmail,
  sendSongReadyEmail,
  sendReferralWelcomeEmail,
  sendReferralRewardEmail,
  sendErrorEmail,
  sendWelcomeEmail,
  testEmailConfig,
};
