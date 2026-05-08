// @ts-check
/**
 * Email service — thin re-export shim.
 *
 * All implementation has moved to ./email/ modules.
 * This file preserves backward compatibility for existing consumers.
 *
 * See: backend/email/index.js for the full module map.
 */
export {
  sendEmail,
  sendSongReadyEmail,
  sendReferralWelcomeEmail,
  sendReferralRewardEmail,
  sendErrorEmail,
  sendWelcomeEmail,
  testEmailConfig,
} from "./email/index.js";
