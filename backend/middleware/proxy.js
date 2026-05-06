// @ts-check
import http from "http";
import https from "https";

const STEM_SERVICE_URL =
  process.env.STEM_SERVICE_URL || "http://localhost:5000";
const STEM_SERVICE_API_TOKEN = process.env.STEM_SERVICE_API_TOKEN || "";

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
export function proxyFormRequest(endpointPath, form, options = {}) {
  const stemUrl = new URL(endpointPath, STEM_SERVICE_URL);
  const isHttps = stemUrl.protocol === "https:";
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

    const opts = {
      hostname: stemUrl.hostname,
      port: stemUrl.port || (isHttps ? 443 : 80),
      path: stemUrl.pathname + stemUrl.search,
      method: "POST",
      headers: withStemServiceAuthHeader(form.getHeaders()),
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

/**
 * Get the configured stem service URL.
 * @returns {string}
 */
export function getStemServiceUrl() {
  return process.env.STEM_SERVICE_URL || "http://localhost:5000";
}
