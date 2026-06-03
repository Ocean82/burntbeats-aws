// @ts-check

const TOKEN_MIN_LENGTH = 16;

/**
 * Whether backend↔Python service calls must use shared API tokens.
 * Explicit INTERNAL_SERVICE_AUTH_REQUIRED overrides; default true in production.
 * @returns {boolean}
 */
export function isInternalServiceAuthRequired() {
  const explicit = process.env.INTERNAL_SERVICE_AUTH_REQUIRED;
  if (explicit != null && String(explicit).trim() !== "") {
    return ["1", "true", "yes"].includes(String(explicit).toLowerCase());
  }
  return process.env.NODE_ENV === "production";
}

/**
 * @param {string | undefined} token
 * @returns {boolean}
 */
export function isValidServiceApiToken(token) {
  return typeof token === "string" && token.length >= TOKEN_MIN_LENGTH;
}

/**
 * Collect missing/invalid internal service token env names when auth is required.
 * @returns {string[]}
 */
export function getMissingInternalServiceTokens() {
  if (!isInternalServiceAuthRequired()) return [];
  const checks = [
    ["STEM_SERVICE_API_TOKEN", process.env.STEM_SERVICE_API_TOKEN],
    ["SPEECH_SERVICE_API_TOKEN", process.env.SPEECH_SERVICE_API_TOKEN],
    ["MIDI_SERVICE_API_TOKEN", process.env.MIDI_SERVICE_API_TOKEN],
  ];
  /** @type {string[]} */
  const missing = [];
  for (const [name, value] of checks) {
    if (!isValidServiceApiToken(value)) {
      missing.push(`${name} (min ${TOKEN_MIN_LENGTH} chars)`);
    }
  }
  return missing;
}
