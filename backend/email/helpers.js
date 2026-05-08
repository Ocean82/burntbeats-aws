// @ts-check
/**
 * Email utility helpers — shared across templates and sender.
 */

/**
 * Escape user-supplied strings before embedding in HTML email templates.
 * Prevents XSS / HTML injection in outbound emails.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
