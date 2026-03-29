// @ts-check
/**
 * Shared Clerk JWT verification for billing and usage-token routes.
 */
import { createClerkClient, verifyToken as clerkVerifyToken } from "@clerk/express";

let _clerk = /** @type {ReturnType<typeof createClerkClient> | null} */ (null);
let _clerkKey = "";

export function getClerkClient() {
  const key = process.env.CLERK_SECRET_KEY || "";
  if (!key) return null;
  if (key !== _clerkKey) {
    _clerk = createClerkClient({ secretKey: key });
    _clerkKey = key;
  }
  return _clerk;
}

/**
 * Verify Clerk JWT from Authorization: Bearer; returns Clerk user id.
 * @param {import("express").Request} req
 * @returns {Promise<string>}
 */
export async function verifyClerkBearer(req) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw Object.assign(new Error("Missing auth token"), { status: 401 });
  const clerk = getClerkClient();
  if (!clerk) throw Object.assign(new Error("Auth not configured — CLERK_SECRET_KEY not set"), { status: 503 });
  const key = process.env.CLERK_SECRET_KEY || "";
  try {
    const payload = await clerkVerifyToken(token, { secretKey: key });
    if (!payload?.sub) throw new Error("Invalid token payload");
    return payload.sub;
  } catch (/** @type {any} */ e) {
    console.error("[clerkAuth]", e.message);
    throw Object.assign(new Error("Invalid or expired token"), { status: 401 });
  }
}
