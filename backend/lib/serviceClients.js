// @ts-check
/**
 * Service client wrappers with circuit breaker, timeout, and correlation ID.
 *
 * Each downstream Python service gets a dedicated client instance that:
 * - Applies circuit breaker protection (open after N failures, auto-recover)
 * - Enforces request timeouts via AbortController
 * - Forwards X-Correlation-ID for distributed tracing
 *
 * Usage in route handlers:
 *   import { stemServiceClient } from "../../lib/serviceClients.js";
 *   const response = await stemServiceClient.fetchJson(req, "/health");
 */
import http from "http";
import { CircuitBreaker, CircuitOpenError } from "./circuitBreaker.js";
import { getCorrelationId } from "./correlationId.js";

const STEM_SERVICE_URL = process.env.STEM_SERVICE_URL || "http://localhost:5000";
const SPEECH_SERVICE_URL = process.env.SPEECH_SERVICE_URL || "http://127.0.0.1:5001";
const MIDI_SERVICE_URL = process.env.MIDI_SERVICE_URL || "http://127.0.0.1:5002";

const STEM_SERVICE_API_TOKEN = process.env.STEM_SERVICE_API_TOKEN || "";
const SPEECH_SERVICE_API_TOKEN = process.env.SPEECH_SERVICE_API_TOKEN || "";
const MIDI_SERVICE_API_TOKEN = process.env.MIDI_SERVICE_API_TOKEN || "";

/** Default timeout for status/health checks (ms). */
const STATUS_TIMEOUT = Number(process.env.SERVICE_STATUS_TIMEOUT_MS) || 5_000;

/**
 * @typedef {{
 *   name: string,
 *   baseUrl: string,
 *   authHeader?: { key: string, value: string },
 *   failureThreshold?: number,
 *   resetTimeout?: number,
 * }} ServiceClientConfig
 */

class ServiceClient {
  /** @param {ServiceClientConfig} config */
  constructor(config) {
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.authHeader = config.authHeader || null;
    this.breaker = new CircuitBreaker({
      name: config.name,
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeout: config.resetTimeout ?? 30_000,
    });
  }

  /**
   * Make a JSON GET request through the circuit breaker.
   * @param {import("express").Request} req - Express request (for correlation ID).
   * @param {string} path - URL path (e.g., "/health").
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<{ statusCode: number, data: any }>}
   */
  async fetchJson(req, path, options = {}) {
    const timeoutMs = options.timeoutMs ?? STATUS_TIMEOUT;
    return this.breaker.call(() => this._doGet(req, path, timeoutMs));
  }

  /** @returns {string} Current circuit state. */
  getCircuitState() {
    return this.breaker.getState();
  }

  /**
   * @private
   * @param {import("express").Request} req
   * @param {string} path
   * @param {number} timeoutMs
   * @returns {Promise<{ statusCode: number, data: any }>}
   */
  _doGet(req, path, timeoutMs) {
    const url = new URL(path, this.baseUrl);
    const correlationId = getCorrelationId(req);

    /** @type {Record<string, string>} */
    const headers = { Accept: "application/json" };
    if (correlationId) headers["X-Correlation-ID"] = correlationId;
    if (this.authHeader) headers[this.authHeader.key] = this.authHeader.value;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        proxyReq.destroy();
        reject(new Error(`${this.name} timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const proxyReq = http.get(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          headers,
        },
        (res) => {
          clearTimeout(timer);
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf-8");
            try {
              const data = body ? JSON.parse(body) : {};
              resolve({ statusCode: res.statusCode || 200, data });
            } catch {
              resolve({ statusCode: res.statusCode || 200, data: body });
            }
          });
          res.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
          });
        },
      );

      proxyReq.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

// ── Service client instances ─────────────────────────────────────────────────

export const stemServiceClient = new ServiceClient({
  name: "stem_service",
  baseUrl: STEM_SERVICE_URL,
  authHeader: STEM_SERVICE_API_TOKEN
    ? { key: "X-Stem-Service-Token", value: STEM_SERVICE_API_TOKEN }
    : undefined,
});

export const speechServiceClient = new ServiceClient({
  name: "speech_service",
  baseUrl: SPEECH_SERVICE_URL,
  authHeader: SPEECH_SERVICE_API_TOKEN
    ? { key: "X-Speech-Service-Token", value: SPEECH_SERVICE_API_TOKEN }
    : undefined,
});

export const midiServiceClient = new ServiceClient({
  name: "midi_service",
  baseUrl: MIDI_SERVICE_URL,
  authHeader: MIDI_SERVICE_API_TOKEN
    ? { key: "X-Midi-Service-Token", value: MIDI_SERVICE_API_TOKEN }
    : undefined,
});

/**
 * Get circuit breaker states for all services (for health endpoint).
 * @returns {{ stem: string, speech: string, midi: string }}
 */
export function getCircuitStates() {
  return {
    stem: stemServiceClient.getCircuitState(),
    speech: speechServiceClient.getCircuitState(),
    midi: midiServiceClient.getCircuitState(),
  };
}

export { CircuitOpenError };
