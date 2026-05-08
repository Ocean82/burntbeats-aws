// @ts-check
/**
 * Email module barrel — re-exports all public symbols.
 *
 * Consumers can import from "./email/index.js" or the original
 * "./email-service.js" shim (which re-exports from here).
 */
export {
  sendEmail,
  sendSongReadyEmail,
  sendReferralWelcomeEmail,
  sendReferralRewardEmail,
  sendErrorEmail,
  sendWelcomeEmail,
  testEmailConfig,
} from "./sender.js";

export { escapeHtml } from "./helpers.js";

export { TEMPLATES } from "./templates.js";
