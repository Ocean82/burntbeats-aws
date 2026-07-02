// @ts-check
import http from "http";
import https from "https";

const STEM_SERVICE_URL =
  process.env.STEM_SERVICE_URL || "http://localhost:5000";
const STEM_SERVICE_API_TOKEN = process.env.STEM_SERVICE_API_TOKEN || "";

const SPEECH_SERVICE_URL =
  process.env.SPEECH_SERVICE_URL || "http://127.0.0.1:5001";
const SPEECH_SERVICE_API_TOKEN = process.env.SPEECH_SERVICE_API_TOKEN || "";

/**
 * Inject correlation ID into outbound headers when available.
 * @param {Record<string, string>} headers
 * @param {string | undefined} correlationId
 * @returns {Record<string, string>}
 */
function withCorrelationId(headers, correlationId) {
  if (!correlationId) return headers;
  return { ...headers, "X-Correlation-ID": correlationId };
}

/**
 * Forward distributed tracing headers to downstream services.
 * @param {Record<string, string>} headers
 * @param {import("express").Request | undefined} req
 * @returns {Record<string, string>}
 */
function withTraceHeaders(headers, req) {
  if (!req) return headers;
  const sentryTrace = req.get?.("sentry-trace");
  const baggage = req.get?.("baggage");
  const next = { ...headers };
  if (sentryTrace) next["sentry-trace"] = sentryTrace;
  if (baggage) next["baggage"] = baggage;
  return next;
}

/**
 * Attach stem-service auth header when token protection is enabled.
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
export function withStemServiceAuthHeader(headers) {
  if (!STEM_SERVICE_API_TOKEN) return headers;
  return { ...headers, "X-Stem-Service-Token": STEM_SERVICE_API_TOKEN };
}

/**
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
export function withSpeechServiceAuthHeader(headers) {
  if (!SPEECH_SERVICE_API_TOKEN) return headers;
  return { ...headers, "X-Speech-Service-Token": SPEECH_SERVICE_API_TOKEN };
}

/**
 * @param {unknown} e
 * @returns {e is { statusCode: number, error: string }}
 */
export function isProxyHttpError(e) {
  return !!(
    e &&
    typeof e === "object" &&
    "statusCode" in e &&
    "error" in e &&
    typeof (/** @type {{ statusCode?: unknown }} */ (e).statusCode) ===
      "number" &&
    typeof (/** @type {{ error?: unknown }} */ (e).error) === "string"
  );
}

/**
 * @param {string} body
 * @param {string | undefined} fallback
 * @returns {string}
 */
export function extractProxyErrorMessage(body, fallback) {
  let errMsg = body || fallback || "Upstream request failed";
  try {
    const j = JSON.parse(body || "{}");
    if (j.detail != null)
      errMsg =
        typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
  } catch {
    /* use body/fallback as-is */
  }
  return errMsg;
}

/**
 * Send multipart/form-data request to stem service and parse JSON response.
 * @param {string} endpointPath
 * @param {import("form-data")} form
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ statusCode: number, data: any }>}
 */
/**
 * @param {string} baseUrl
 * @param {string} endpointPath
 * @param {import("form-data")} form
 * @param {{ timeoutMs?: number, authHeaderFn?: (h: Record<string, string>) => Record<string, string>, correlationId?: string, req?: import("express").Request }} [options]
 */
export function proxyFormRequestTo(
  baseUrl,
  endpointPath,
  form,
  options = {},
) {
  const targetUrl = new URL(endpointPath, baseUrl);
  const authHeaderFn = options.authHeaderFn || withStemServiceAuthHeader;
  const isHttps = targetUrl.protocol === "https:";
  const client = isHttps ? https : http;
  const reqAbort = new AbortController();

  return new Promise((resolve, reject) => {
    /** @type {NodeJS.Timeout | null} */
    let timeout = null;
    if (options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        reqAbort.abort();
        reject(new Error("TimeoutError"));
      }, options.timeoutMs);
    }

    const clearTimeoutIfSet = () => {
      if (timeout) clearTimeout(timeout);
    };

    let headers = authHeaderFn(form.getHeaders());
    headers = withCorrelationId(headers, options.correlationId);
    headers = withTraceHeaders(headers, options.req);

    const opts = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: "POST",
      headers,
      signal: reqAbort.signal,
    };

    const proxyReq = client.request(opts, (proxyRes) => {
      clearTimeoutIfSet();
      const chunks = [];
      proxyRes.on("data", (d) => chunks.push(d));
      proxyRes.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        try {
          const parsed = body ? JSON.parse(body) : {};
          if ((proxyRes.statusCode || 500) >= 400) {
            reject({
              statusCode: proxyRes.statusCode || 500,
              error: extractProxyErrorMessage(body, proxyRes.statusMessage),
            });
          } else {
            resolve({ statusCode: proxyRes.statusCode || 200, data: parsed });
          }
        } catch (e) {
          reject(e);
        }
      });
      proxyRes.on("error", (err) => {
        clearTimeoutIfSet();
        reject(err);
      });
    });

    proxyReq.on("error", (err) => {
      clearTimeoutIfSet();
      reject(err);
    });

    form.pipe(proxyReq);
  });
}

export function proxyFormRequest(endpointPath, form, options = {}) {
  return proxyFormRequestTo(STEM_SERVICE_URL, endpointPath, form, {
    ...options,
    authHeaderFn: withStemServiceAuthHeader,
  });
}

export function proxySpeechFormRequest(endpointPath, form, options = {}) {
  return proxyFormRequestTo(SPEECH_SERVICE_URL, endpointPath, form, {
    ...options,
    authHeaderFn: withSpeechServiceAuthHeader,
  });
}

/**
 * Get the configured stem service URL.
 * @returns {string}
 */
export function getStemServiceUrl() {
  return process.env.STEM_SERVICE_URL || "http://localhost:5000";
}

/**
 * @returns {string}
 */
export function getSpeechServiceUrl() {
  return process.env.SPEECH_SERVICE_URL || "http://127.0.0.1:5001";
}

export { withCorrelationId };
